import { toCamelCase, toPascalCase } from '../template/TemplateEngine.js'
import { BaseGenerator } from './BaseGenerator.js'

export class DrizzleSchemaGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Generating Drizzle schema...')

    const { ast } = this.ctx
    // Reserved auto-managed timestamp fields — appended by template
    const reservedFields = new Set(['createdAt', 'updatedAt'])

    // Build a set of all entity names for relation resolution
    const entityNames = new Set(ast.entities.map((e) => e.name))

    // Collect pgEnum declarations (one per enum field, named {entityName}{FieldName}Enum)
    const enumDeclarations: Array<{ fnName: string; dbName: string; values: string[] }> = []
    for (const entity of ast.entities) {
      for (const f of entity.fields) {
        if (f.type === 'Enum' && f.enumValues) {
          enumDeclarations.push({
            fnName: `${toCamelCase(entity.name)}${toPascalCase(f.name)}Enum`,
            dbName: `${toCamelCase(entity.name)}_${toCamelCase(f.name)}`,
            values: f.enumValues,
          })
        }
      }
    }
    const hasEnums = enumDeclarations.length > 0

    // Build per-entity schema data: scalar columns + FK stubs + relation metadata
    const entitiesWithSchema = ast.entities.map((entity) => {
      // Scalar columns: primitive fields (not virtual array relations)
      const scalarFields = entity.fields
        .filter((f) => !reservedFields.has(f.name) && !(f.isRelation && f.isArray))
        .map((f) => {
          if (!f.isRelation) {
            const isEnum = f.type === 'Enum'
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
              enumFnName: isEnum ? `${toCamelCase(entity.name)}${toPascalCase(f.name)}Enum` : undefined,
            }
          }
          // Many-to-one relation → FK column ({name}Id)
          return {
            name: `${f.name}Id`,
            type: 'Int',
            modifiers: [] as string[],
            nullable: f.nullable,
            defaultValue: undefined,
            isUpdatedAt: false,
            isForeignKey: true,
            referencedTable: `${toCamelCase(f.relatedEntity!)}s`,
            onDelete: f.onDelete ?? 'cascade',
          }
        })

      // Many-to-one relations (generates `one()` side in Drizzle relations)
      const manyToOne = entity.fields
        .filter((f) => f.isRelation && !f.isArray && entityNames.has(f.relatedEntity!))
        .map((f) => ({
          name: f.name,
          relatedEntity: f.relatedEntity!,
          relatedTable: `${toCamelCase(f.relatedEntity!)}s`,
          localField: `${toCamelCase(f.name)}Id`,
          onDelete: f.onDelete ?? 'cascade',
        }))

      // One-to-many virtual relations (generates `many()` side in Drizzle relations)
      const oneToMany = entity.fields
        .filter((f) => f.isRelation && f.isArray && entityNames.has(f.relatedEntity!))
        .map((f) => ({
          fieldName: f.name,
          relatedEntity: f.relatedEntity!,
          relatedTable: `${toCamelCase(f.relatedEntity!)}s`,
        }))

      return {
        name: entity.name,
        scalarFields,
        manyToOne,
        oneToMany,
        hasRelations: manyToOne.length > 0 || oneToMany.length > 0,
      }
    })

    // When auth is present, filter out the auth user entity from the entity loop
    // to avoid duplicate table definitions (the template already emits a hardcoded
    // users table for auth). Any extra fields the user defined on the User entity
    // are forwarded as `authUserExtraFields` so the template can merge them.
    // Relation metadata is forwarded separately so the template can emit a
    // usersRelations block with the correct one/many sides.
    const authUserEntityName = ast.auth?.userEntity
    let authUserExtraFields: typeof entitiesWithSchema[0]['scalarFields'] = []
    let authUserOneToMany: typeof entitiesWithSchema[0]['oneToMany'] = []
    let authUserManyToOne: typeof entitiesWithSchema[0]['manyToOne'] = []

    if (authUserEntityName) {
      const authBuiltinFields = new Set(['id', 'username', 'email', 'createdAt', 'updatedAt'])
      const idx = entitiesWithSchema.findIndex((e) => e.name === authUserEntityName)
      if (idx !== -1) {
        authUserExtraFields = entitiesWithSchema[idx]!.scalarFields.filter(
          (f) => !authBuiltinFields.has(f.name),
        )
        authUserOneToMany = entitiesWithSchema[idx]!.oneToMany
        authUserManyToOne = entitiesWithSchema[idx]!.manyToOne
        entitiesWithSchema.splice(idx, 1)
      }
    }

    const authUserHasRelations = authUserOneToMany.length > 0 || authUserManyToOne.length > 0

    // For crud blocks that reference an entity with no explicit entity block,
    // generate a minimal stub table (id, createdAt, updatedAt only)
    const entityNamesWithBlocks = new Set(ast.entities.map((e) => e.name))
    for (const crud of ast.cruds) {
      if (!entityNamesWithBlocks.has(crud.entity)) {
        entitiesWithSchema.push({
          name: crud.entity,
          scalarFields: [],
          manyToOne: [],
          oneToMany: [],
          hasRelations: false,
        })
      }
    }

    // Also keep the existing crudsWithFields for backward compat with CRUD generator
    const entityMap = new Map(ast.entities.map((e) => [e.name, e.fields]))
    const crudsWithFields = ast.cruds.map((crud) => ({
      ...crud,
      fields: (entityMap.get(crud.entity) ?? []).filter(
        (f) => !reservedFields.has(f.name) && !f.isRelation,
      ),
      hasEntity: entityMap.has(crud.entity),
    }))

    const hasAnyRelations = entitiesWithSchema.some((e) => e.hasRelations) || authUserHasRelations

    this.write(
      `drizzle/schema.${this.ctx.ext}`,
      this.render('shared/drizzle/schema.hbs', { entitiesWithSchema, crudsWithFields, hasAnyRelations, authUserExtraFields, authUserOneToMany, authUserManyToOne, authUserHasRelations, enumDeclarations, hasEnums }),
    )

    // Drizzle Kit config for migrations
    this.write(
      `drizzle.config.${this.ctx.ext}`,
      this.render('shared/drizzle/drizzle.config.hbs'),
    )
  }
}
