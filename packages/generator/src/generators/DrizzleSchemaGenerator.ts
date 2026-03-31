import type { VaspAST } from "@vasp-framework/core";
import type { SchemaSnapshot } from "../manifest/Manifest.js";
import { toCamelCase, toPascalCase, toPlural } from "../template/TemplateEngine.js";
import { BaseGenerator } from "./BaseGenerator.js";

/** Junction table descriptor for an implicit M:N relation */
interface JunctionTable {
  /** Drizzle const name, e.g. "projectsToUsers" */
  tableConst: string;
  /** SQL table name, e.g. "projects_to_users" */
  tableName: string;
  /** First entity name (alphabetically first) */
  entityA: string;
  /** Drizzle table const for entityA, e.g. "projects" */
  entityATable: string;
  /** FK column name for entityA's PK, e.g. "projectId" */
  entityAIdField: string;
  /** Second entity name */
  entityB: string;
  /** Drizzle table const for entityB, e.g. "users" */
  entityBTable: string;
  /** FK column name for entityB's PK, e.g. "userId" */
  entityBIdField: string;
}

export class DrizzleSchemaGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info("Generating Drizzle schema...");

    const { ast } = this.ctx;
    // Reserved auto-managed timestamp fields — appended by template
    const reservedFields = new Set(["createdAt", "updatedAt"]);

    // Build a set of all entity names for relation resolution
    const entityNames = new Set(ast.entities.map((e) => e.name));

    // Collect pgEnum declarations (one per enum field, named {entityName}{FieldName}Enum)
    const enumDeclarations: Array<{
      fnName: string;
      dbName: string;
      values: string[];
    }> = [];
    for (const entity of ast.entities) {
      for (const f of entity.fields) {
        if (f.type === "Enum" && f.enumValues) {
          enumDeclarations.push({
            fnName: `${toCamelCase(entity.name)}${toPascalCase(f.name)}Enum`,
            dbName: `${toCamelCase(entity.name)}_${toCamelCase(f.name)}`,
            values: f.enumValues,
          });
        }
      }
    }
    const hasEnums = enumDeclarations.length > 0;

    // Collect implicit junction tables for @manyToMany fields (deduplicated)
    const junctionTables: JunctionTable[] = [];
    const seenJunctions = new Set<string>();
    for (const entity of ast.entities) {
      for (const f of entity.fields) {
        if (!f.isManyToMany || !f.isArray || !f.isRelation) continue;
        const otherEntity = f.relatedEntity!;
        // Sort alphabetically so User↔Project and Project↔User produce the same key/table
        const [nameA, nameB] = [entity.name, otherEntity].sort() as [
          string,
          string,
        ];
        const key = `${nameA}:${nameB}`;
        if (seenJunctions.has(key)) continue;
        seenJunctions.add(key);
        const tableConst = `${toPlural(toCamelCase(nameA))}To${toPascalCase(toPlural(nameB))}`;
        const tableName = `${toPlural(toCamelCase(nameA))}_to_${toPlural(toCamelCase(nameB))}`;
        junctionTables.push({
          tableConst,
          tableName,
          entityA: nameA,
          entityATable: toPlural(toCamelCase(nameA)),
          entityAIdField: `${toCamelCase(nameA)}Id`,
          entityB: nameB,
          entityBTable: toPlural(toCamelCase(nameB)),
          entityBIdField: `${toCamelCase(nameB)}Id`,
        });
      }
    }

    // Helper: find the junction table const for a given pair of entities
    const junctionFor = (a: string, b: string): string => {
      const [nameA, nameB] = [a, b].sort() as [string, string];
      return `${toPlural(toCamelCase(nameA))}To${toPascalCase(toPlural(nameB))}`;
    };

    // Build per-entity schema data: scalar columns + FK stubs + relation metadata
    const entitiesWithSchema = ast.entities.map((entity) => {
      // Scalar columns: primitive fields (not virtual array relations, not M:N array fields)
      const scalarFields = entity.fields
        .filter(
          (f) => !reservedFields.has(f.name) && !(f.isRelation && f.isArray),
        )
        .map((f) => {
          if (!f.isRelation) {
            const isEnum = f.type === "Enum";
            // Primitive column — pass through as-is
            return {
              name: f.name,
              type: f.type,
              modifiers: f.modifiers,
              nullable: f.nullable,
              defaultValue: f.defaultValue,
              isUpdatedAt: f.isUpdatedAt,
              isForeignKey: false,
              isEnum,
              enumFnName: isEnum
                ? `${toCamelCase(entity.name)}${toPascalCase(f.name)}Enum`
                : undefined,
            };
          }
          // Many-to-one relation → FK column ({name}Id)
          // Self-referential: the FK references the same table — handled in template via isSelfRef
          return {
            name: `${f.name}Id`,
            type: "Int",
            modifiers: [] as string[],
            nullable: f.nullable,
            defaultValue: undefined,
            isUpdatedAt: false,
            isForeignKey: true,
            referencedTable: toPlural(toCamelCase(f.relatedEntity!)),
            onDelete: f.onDelete ?? "cascade",
          };
        });

      // Many-to-one relations (generates `one()` side in Drizzle relations)
      // Annotate self-referential fields so the template can add relationName
      const selfRefArrayFields = entity.fields
        .filter(
          (f) =>
            f.isRelation &&
            f.isArray &&
            !f.isManyToMany &&
            f.relatedEntity === entity.name,
        )
        .map((f) => f.name);

      const manyToOne = entity.fields
        .filter(
          (f) =>
            f.isRelation && !f.isArray && entityNames.has(f.relatedEntity!),
        )
        .map((f) => {
          const isSelfRef = f.relatedEntity === entity.name;
          // For self-referential pairs, use the array-side field name as relationName
          const relationName = isSelfRef
            ? (selfRefArrayFields[0] ?? f.name)
            : undefined;
          return {
            name: f.name,
            relatedEntity: f.relatedEntity!,
            relatedTable: toPlural(toCamelCase(f.relatedEntity!)),
            localField: `${toCamelCase(f.name)}Id`,
            onDelete: f.onDelete ?? "cascade",
            isSelfRef,
            relationName,
          };
        });

      // One-to-many virtual relations (generates `many()` side in Drizzle relations)
      // Excludes @manyToMany array fields — those are handled via junction tables
      // Annotates self-referential fields with the matching singular field's name
      const singularSelfRefFields = entity.fields
        .filter(
          (f) => f.isRelation && !f.isArray && f.relatedEntity === entity.name,
        )
        .map((f) => f.name);

      const oneToMany = entity.fields
        .filter(
          (f) =>
            f.isRelation &&
            f.isArray &&
            !f.isManyToMany &&
            entityNames.has(f.relatedEntity!),
        )
        .map((f) => {
          const isSelfRef = f.relatedEntity === entity.name;
          const relationName = isSelfRef
            ? (singularSelfRefFields[0] ?? f.name)
            : undefined;
          return {
            fieldName: f.name,
            relatedEntity: f.relatedEntity!,
            relatedTable: toPlural(toCamelCase(f.relatedEntity!)),
            isSelfRef,
            relationName,
          };
        });

      // Many-to-many refs: each @manyToMany field contributes a many() to its junction table
      const manyToManyRefs = entity.fields
        .filter(
          (f) =>
            f.isManyToMany &&
            f.isArray &&
            f.isRelation &&
            entityNames.has(f.relatedEntity!),
        )
        .map((f) => ({
          fieldName: f.name,
          junctionTableConst: junctionFor(entity.name, f.relatedEntity!),
        }));

      // Table-level indexes from @@index directives
      const tableIndexes = (entity.indexes ?? []).map((idx) => {
        const camelFields = idx.fields.map(toCamelCase);
        const fieldSlug = camelFields.join("_");
        const isFulltext = idx.type === "fulltext";
        const suffix = isFulltext ? "ft" : "idx";
        const name = `${toPlural(toCamelCase(entity.name))}_${fieldSlug}_${suffix}`;
        // For fulltext: pre-build the to_tsvector SQL expression
        const fulltextSqlExpr = isFulltext
          ? camelFields.length === 1
            ? `to_tsvector('english', \${t.${camelFields[0]}})`
            : `to_tsvector('english', ${camelFields.map((f) => `\${t.${f}}`).join(" || ' ' || ")})`
          : undefined;
        return { name, fields: camelFields, isFulltext, fulltextSqlExpr };
      });

      // Table-level unique constraints from @@unique directives
      const tableUniqueConstraints = (entity.uniqueConstraints ?? []).map(
        (uc) => {
          const fieldSlug = uc.fields.map(toCamelCase).join("_");
          return {
            name: `${toPlural(toCamelCase(entity.name))}_${fieldSlug}_unique`,
            fields: uc.fields.map(toCamelCase),
          };
        },
      );

      const hasTableIndexes =
        tableIndexes.length > 0 || tableUniqueConstraints.length > 0;

      return {
        name: entity.name,
        scalarFields,
        manyToOne,
        oneToMany,
        manyToManyRefs,
        hasRelations:
          manyToOne.length > 0 ||
          oneToMany.length > 0 ||
          manyToManyRefs.length > 0,
        tableIndexes,
        tableUniqueConstraints,
        hasTableIndexes,
      };
    });

    // When auth is present, filter out the auth user entity from the entity loop
    // to avoid duplicate table definitions (the template emits the auth user table
    // using the dynamic userTableName). Any extra fields the user defined on the
    // user entity are forwarded as `authUserExtraFields` so the template can merge them.
    // Relation metadata is forwarded separately so the template can emit a
    // <userTableName>Relations block with the correct one/many sides.
    const authUserEntityName = ast.auth?.userEntity ?? null;

    // Derive the Drizzle table const name and SQL table name from the user entity name.
    // Matches the convention used in AuthGenerator: toPlural(toCamelCase(userEntity)).
    // e.g. "User" → "users", "Account" → "accounts", "Person" → "people"
    const userTableName = authUserEntityName
      ? toPlural(toCamelCase(authUserEntityName))
      : "users";

    // Detect password field name on the user entity (either 'password' or 'passwordHash').
    const authUserEntity = authUserEntityName
      ? ast.entities.find((e) => e.name === authUserEntityName)
      : undefined;
    const passwordField = authUserEntity?.fields.find(
      (f) => f.name === "password" || f.name === "passwordHash",
    );
    const passwordFieldName = passwordField?.name ?? "passwordHash";

    let authUserExtraFields: (typeof entitiesWithSchema)[0]["scalarFields"] =
      [];
    let authUserOneToMany: (typeof entitiesWithSchema)[0]["oneToMany"] = [];
    let authUserManyToOne: (typeof entitiesWithSchema)[0]["manyToOne"] = [];
    let authUserManyToManyRefs: (typeof entitiesWithSchema)[0]["manyToManyRefs"] =
      [];

    if (authUserEntityName) {
      // Fields hardcoded in the schema template's auth user table block —
      // exclude them from authUserExtraFields to prevent duplicate columns.
      const authBuiltinFields = new Set([
        "id",
        "username",
        "email",
        "passwordHash",
        "password",
        "googleId",
        "githubId",
        "createdAt",
        "updatedAt",
      ]);
      const idx = entitiesWithSchema.findIndex(
        (e) => e.name === authUserEntityName,
      );
      if (idx !== -1) {
        authUserExtraFields = entitiesWithSchema[idx]!.scalarFields.filter(
          (f) => !authBuiltinFields.has(f.name),
        );
        authUserOneToMany = entitiesWithSchema[idx]!.oneToMany;
        authUserManyToOne = entitiesWithSchema[idx]!.manyToOne;
        authUserManyToManyRefs = entitiesWithSchema[idx]!.manyToManyRefs;
        entitiesWithSchema.splice(idx, 1);
      }
    }

    const authUserHasRelations =
      authUserOneToMany.length > 0 ||
      authUserManyToOne.length > 0 ||
      authUserManyToManyRefs.length > 0;

    // For crud blocks that reference an entity with no explicit entity block,
    // generate a minimal stub table (id, createdAt, updatedAt only)
    const entityNamesWithBlocks = new Set(ast.entities.map((e) => e.name));
    for (const crud of ast.cruds) {
      if (!entityNamesWithBlocks.has(crud.entity)) {
        entitiesWithSchema.push({
          name: crud.entity,
          scalarFields: [],
          manyToOne: [],
          oneToMany: [],
          manyToManyRefs: [],
          hasRelations: false,
          tableIndexes: [],
          tableUniqueConstraints: [],
          hasTableIndexes: false,
        });
      }
    }

    // Also keep the existing crudsWithFields for backward compat with CRUD generator
    const entityMap = new Map(ast.entities.map((e) => [e.name, e.fields]));
    const crudsWithFields = ast.cruds.map((crud) => ({
      ...crud,
      fields: (entityMap.get(crud.entity) ?? []).filter(
        (f) => !reservedFields.has(f.name) && !f.isRelation,
      ),
      hasEntity: entityMap.has(crud.entity),
    }));

    const hasAnyRelations =
      entitiesWithSchema.some((e) => e.hasRelations) ||
      authUserHasRelations ||
      junctionTables.length > 0;

    const hasAnyIndexes = entitiesWithSchema.some((e) => e.hasTableIndexes);
    const hasAnyFulltextIndexes = entitiesWithSchema.some((e) =>
      e.tableIndexes.some((idx) => idx.isFulltext),
    );
    // hasAnyTables is true when there is at least one table to define in the schema:
    // either a user-defined entity or the built-in auth users table.
    const hasAnyTables = entitiesWithSchema.length > 0 || !!ast.auth;

    this.write(
      `drizzle/schema.${this.ctx.ext}`,
      this.render("shared/drizzle/schema.hbs", {
        entitiesWithSchema,
        crudsWithFields,
        hasAnyRelations,
        authUserExtraFields,
        authUserOneToMany,
        authUserManyToOne,
        authUserManyToManyRefs,
        authUserHasRelations,
        authUserEntityName,
        userTableName,
        passwordFieldName,
        enumDeclarations,
        hasEnums,
        junctionTables,
        hasAnyIndexes,
        hasAnyFulltextIndexes,
        hasAnyTables,
      }),
    );

    // Drizzle Kit config for migrations
    this.write(
      `drizzle.config.${this.ctx.ext}`,
      this.render("shared/drizzle/drizzle.config.hbs"),
    );

    // Persist a schema snapshot into the manifest so that the next `vasp generate`
    // can detect potentially-destructive changes (column drops, type changes, table drops).
    this.manifest.setSchemaSnapshot(buildSchemaSnapshot(ast));
  }
}

/**
 * Build a lightweight snapshot of the DB columns that Drizzle will manage.
 * Only tracks columns that map directly to a DB column:
 *   - Primitive fields (non-relation)
 *   - Many-to-one FK columns (named `${fieldName}Id`, typed Int)
 * Excludes:
 *   - `createdAt` / `updatedAt` (auto-managed, never destructively changed)
 *   - One-to-many virtual array fields (no DB column)
 *   - Many-to-many array fields (junction table, no column on the owning entity)
 */
function buildSchemaSnapshot(ast: VaspAST): SchemaSnapshot {
  const RESERVED = new Set(["createdAt", "updatedAt"]);
  const entities: SchemaSnapshot["entities"] = {};

  for (const entity of ast.entities) {
    const fields: Record<string, { type: string; nullable: boolean }> = {};

    for (const f of entity.fields) {
      if (RESERVED.has(f.name)) continue;
      // Virtual one-to-many array fields and M:N array fields produce no column
      if (f.isRelation && f.isArray) continue;

      if (f.isRelation) {
        // Many-to-one → FK column `${name}Id : Int`
        fields[`${f.name}Id`] = { type: "Int", nullable: f.nullable };
      } else {
        fields[f.name] = { type: f.type, nullable: f.nullable };
      }
    }

    entities[entity.name] = { fields };
  }

  return { entities };
}
