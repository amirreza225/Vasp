// @exhaustiveness-partial: field-type
// Intentional: checkValidationRules() only branches on String/Text/Int/Float
// because those are the only types that support @validate. All other
// PrimitiveFieldType values (Boolean, DateTime, Json, Enum, File) are
// rejected earlier via the noValidationTypes Set.
import type {
  ParseDiagnostic,
  SourceLocation,
  VaspAST,
} from "@vasp-framework/core";
import {
  ParseError,
  SUPPORTED_API_METHODS,
  SUPPORTED_AUTH_METHODS,
  SUPPORTED_CRUD_OPERATIONS,
  SUPPORTED_EMAIL_PROVIDERS,
  SUPPORTED_MIDDLEWARE_SCOPES,
  SUPPORTED_MULTI_TENANT_STRATEGIES,
  SUPPORTED_REALTIME_EVENTS,
  SUPPORTED_FIELD_TYPES,
  SUPPORTED_STORAGE_PROVIDERS,
} from "@vasp-framework/core";

export class SemanticValidator {
  private readonly diagnostics: ParseDiagnostic[] = [];

  /**
   * Run all semantic checks and return every diagnostic (errors and warnings)
   * without throwing. Useful for tooling that wants to inspect warnings even
   * when the file is otherwise valid.
   */
  collectDiagnostics(ast: VaspAST): ParseDiagnostic[] {
    // Reset so the same instance can be safely called multiple times.
    this.diagnostics.length = 0;
    this.checkAppExists(ast);
    this.checkDuplicateEntities(ast);
    this.checkDuplicateRoutes(ast);
    this.checkDuplicateBlocks(ast);
    this.checkRouteTargets(ast);
    this.checkCrudEntities(ast);
    this.checkCrudOperations(ast);
    this.checkRealtimeEntities(ast);
    this.checkAuthMethods(ast);
    this.checkRoleConfiguration(ast);
    this.checkPermissionConfiguration(ast);
    this.checkQueryActionEntities(ast);
    this.checkApiMethods(ast);
    this.checkMiddlewareScopes(ast);
    this.checkEnvSchema(ast);
    this.checkJobExecutors(ast);
    this.checkFieldTypes(ast);
    this.checkRelationModifiers(ast);
    this.checkModifierTypeConstraints(ast);
    this.checkFieldValidation(ast);
    this.checkEntityIndexFields(ast);
    this.checkAdminEntities(ast);
    this.checkStorageBlocks(ast);
    this.checkStorageFieldRefs(ast);
    this.checkEmailProviders(ast);
    this.checkEmailOnSuccess(ast);
    this.checkMultiTenantConfig(ast);
    return [...this.diagnostics];
  }

  validate(ast: VaspAST): void {
    const diagnostics = this.collectDiagnostics(ast);
    const hasErrors = diagnostics.some((d) => d.code.startsWith("E"));
    if (hasErrors) {
      throw new ParseError(diagnostics);
    }
  }

  private checkAppExists(ast: VaspAST): void {
    if (!ast.app) {
      this.diagnostics.push({
        code: "E100_MISSING_APP_BLOCK",
        message: "No app block found in main.vasp",
        hint: "Every Vasp project requires exactly one app { } block",
      });
    }
  }

  private checkRouteTargets(ast: VaspAST): void {
    const pageNames = new Set(ast.pages.map((p) => p.name));
    for (const route of ast.routes) {
      if (!pageNames.has(route.to)) {
        this.diagnostics.push({
          code: "E101_UNKNOWN_PAGE_REF",
          message: `Route '${route.name}' references unknown page '${route.to}'`,
          hint: `Add a page block named '${route.to}', or fix the 'to' value in route '${route.name}'`,
          loc: route.loc,
        });
      }
    }
  }

  private checkCrudEntities(ast: VaspAST): void {
    if (ast.entities.length === 0) return;
    const entityNames = new Set(ast.entities.map((e) => e.name));
    for (const crud of ast.cruds) {
      if (!entityNames.has(crud.entity)) {
        this.diagnostics.push({
          code: "E111_CRUD_ENTITY_NOT_DECLARED",
          message: `crud '${crud.name}' references entity '${crud.entity}' which has no entity block`,
          hint: `Add an entity block for '${crud.entity}', or remove the crud block`,
          loc: crud.loc,
        });
      }
    }
  }

  private checkCrudOperations(ast: VaspAST): void {
    for (const crud of ast.cruds) {
      if (crud.operations.length === 0) {
        this.diagnostics.push({
          code: "E102_EMPTY_CRUD_OPERATIONS",
          message: `crud '${crud.name}' has no operations`,
          hint: "Add at least one operation: operations: [list, create, update, delete]",
          loc: crud.loc,
        });
      }
      for (const op of crud.operations) {
        if (!(SUPPORTED_CRUD_OPERATIONS as readonly string[]).includes(op)) {
          this.diagnostics.push({
            code: "E103_UNKNOWN_CRUD_OPERATION",
            message: `Unknown crud operation '${op}' in '${crud.name}'`,
            hint: `Supported operations: ${SUPPORTED_CRUD_OPERATIONS.join(", ")}`,
            loc: crud.loc,
          });
        }
      }
    }
  }

  private checkRealtimeEntities(ast: VaspAST): void {
    const crudEntities = new Set(ast.cruds.map((c) => c.entity));
    for (const rt of ast.realtimes) {
      if (!crudEntities.has(rt.entity)) {
        this.diagnostics.push({
          code: "E104_REALTIME_ENTITY_NOT_CRUD",
          message: `realtime '${rt.name}' references entity '${rt.entity}' which has no crud block`,
          hint: `Add a crud block for entity '${rt.entity}', or remove the realtime block`,
          loc: rt.loc,
        });
      }
      for (const event of rt.events) {
        if (!(SUPPORTED_REALTIME_EVENTS as readonly string[]).includes(event)) {
          this.diagnostics.push({
            code: "E105_UNKNOWN_REALTIME_EVENT",
            message: `Unknown realtime event '${event}' in '${rt.name}'`,
            hint: `Supported events: ${SUPPORTED_REALTIME_EVENTS.join(", ")}`,
            loc: rt.loc,
          });
        }
      }
    }
  }

  private checkAuthMethods(ast: VaspAST): void {
    if (!ast.auth) return;
    if (ast.auth.methods.length === 0) {
      this.diagnostics.push({
        code: "E106_EMPTY_AUTH_METHODS",
        message: `auth '${ast.auth.name}' has no methods`,
        hint: `Add at least one method: methods: [usernameAndPassword]`,
        loc: ast.auth.loc,
      });
    }
    for (const method of ast.auth.methods) {
      if (!(SUPPORTED_AUTH_METHODS as readonly string[]).includes(method)) {
        this.diagnostics.push({
          code: "E107_UNKNOWN_AUTH_METHOD",
          message: `Unknown auth method '${method}'`,
          hint: `Supported methods: ${SUPPORTED_AUTH_METHODS.join(", ")}`,
          loc: ast.auth.loc,
        });
      }
    }
  }

  private checkRoleConfiguration(ast: VaspAST): void {
    const configuredRoles = new Set(ast.auth?.roles ?? []);

    if ((ast.auth?.roles ?? []).length === 0) {
      for (const query of ast.queries) {
        if ((query.roles ?? []).length > 0) {
          this.diagnostics.push({
            code: "E118_ROLES_WITHOUT_AUTH_CONFIG",
            message: `Query '${query.name}' declares roles but auth.roles is not configured`,
            hint: "Define roles in auth block: roles: [admin, ...]",
            loc: query.loc,
          });
        }
      }
      for (const action of ast.actions) {
        if ((action.roles ?? []).length > 0) {
          this.diagnostics.push({
            code: "E118_ROLES_WITHOUT_AUTH_CONFIG",
            message: `Action '${action.name}' declares roles but auth.roles is not configured`,
            hint: "Define roles in auth block: roles: [admin, ...]",
            loc: action.loc,
          });
        }
      }
      for (const api of ast.apis ?? []) {
        if ((api.roles ?? []).length > 0) {
          this.diagnostics.push({
            code: "E118_ROLES_WITHOUT_AUTH_CONFIG",
            message: `Api '${api.name}' declares roles but auth.roles is not configured`,
            hint: "Define roles in auth block: roles: [admin, ...]",
            loc: api.loc,
          });
        }
      }
    }

    for (const query of ast.queries) {
      if ((query.roles ?? []).length > 0 && !query.auth) {
        this.diagnostics.push({
          code: "E119_ROLES_REQUIRE_AUTH",
          message: `Query '${query.name}' declares roles but auth is false`,
          hint: "Set auth: true when using roles",
          loc: query.loc,
        });
      }
      for (const role of query.roles ?? []) {
        if (!configuredRoles.has(role)) {
          this.diagnostics.push({
            code: "E120_UNKNOWN_ROLE_REF",
            message: `Query '${query.name}' references unknown role '${role}'`,
            hint: `Define '${role}' in auth.roles`,
            loc: query.loc,
          });
        }
      }
    }

    for (const action of ast.actions) {
      if ((action.roles ?? []).length > 0 && !action.auth) {
        this.diagnostics.push({
          code: "E119_ROLES_REQUIRE_AUTH",
          message: `Action '${action.name}' declares roles but auth is false`,
          hint: "Set auth: true when using roles",
          loc: action.loc,
        });
      }
      for (const role of action.roles ?? []) {
        if (!configuredRoles.has(role)) {
          this.diagnostics.push({
            code: "E120_UNKNOWN_ROLE_REF",
            message: `Action '${action.name}' references unknown role '${role}'`,
            hint: `Define '${role}' in auth.roles`,
            loc: action.loc,
          });
        }
      }
    }

    for (const api of ast.apis ?? []) {
      if ((api.roles ?? []).length > 0 && !api.auth) {
        this.diagnostics.push({
          code: "E119_ROLES_REQUIRE_AUTH",
          message: `Api '${api.name}' declares roles but auth is false`,
          hint: "Set auth: true when using roles",
          loc: api.loc,
        });
      }
      for (const role of api.roles ?? []) {
        if (!configuredRoles.has(role)) {
          this.diagnostics.push({
            code: "E120_UNKNOWN_ROLE_REF",
            message: `Api '${api.name}' references unknown role '${role}'`,
            hint: `Define '${role}' in auth.roles`,
            loc: api.loc,
          });
        }
      }
    }
  }

  /**
   * E123 – E125: Validate auth.permissions and crud.permissions.
   *
   * Rules:
   *  E123_PERMISSIONS_REQUIRE_ROLES   – auth.permissions defined but auth.roles is empty
   *  E124_UNKNOWN_PERMISSION_ROLE_REF – a role listed in auth.permissions is not in auth.roles
   *  E125_UNKNOWN_PERMISSION_REF      – a crud.permissions value is not declared in auth.permissions
   *  E126_CRUD_PERMISSION_UNKNOWN_OP  – a crud.permissions key is not in crud.operations
   */
  private checkPermissionConfiguration(ast: VaspAST): void {
    const authPermissions = ast.auth?.permissions ?? {};
    const configuredRoles = new Set(ast.auth?.roles ?? []);
    const declaredPermissions = new Set(Object.keys(authPermissions));

    // Validate auth.permissions entries
    if (Object.keys(authPermissions).length > 0) {
      if (configuredRoles.size === 0) {
        this.diagnostics.push({
          code: "E123_PERMISSIONS_REQUIRE_ROLES",
          message: `auth '${ast.auth!.name}' defines permissions but has no roles configured`,
          hint: "Add roles to the auth block: roles: [admin, ...]",
          loc: ast.auth!.loc,
        });
      }
      for (const [permName, roles] of Object.entries(authPermissions)) {
        for (const role of roles) {
          if (!configuredRoles.has(role)) {
            this.diagnostics.push({
              code: "E124_UNKNOWN_PERMISSION_ROLE_REF",
              message: `Permission '${permName}' references unknown role '${role}'`,
              hint: `Define '${role}' in auth.roles`,
              loc: ast.auth!.loc,
            });
          }
        }
      }
    }

    // Validate crud.permissions entries
    for (const crud of ast.cruds) {
      if (!crud.permissions) continue;
      for (const [op, permName] of Object.entries(crud.permissions)) {
        // The operation key must be one of the declared operations for this crud block
        if (!crud.operations.includes(op as never)) {
          this.diagnostics.push({
            code: "E126_CRUD_PERMISSION_UNKNOWN_OP",
            message: `crud '${crud.name}' permissions map references operation '${op}' which is not in its operations list`,
            hint: `Add '${op}' to crud operations, or remove it from permissions`,
            loc: crud.loc,
          });
        }
        // The permission value must be declared in auth.permissions
        if (
          declaredPermissions.size > 0 &&
          !declaredPermissions.has(permName)
        ) {
          this.diagnostics.push({
            code: "E125_UNKNOWN_PERMISSION_REF",
            message: `crud '${crud.name}' references undeclared permission '${permName}'`,
            hint: `Declare '${permName}' in auth.permissions`,
            loc: crud.loc,
          });
        }
      }
    }
  }

  private checkQueryActionEntities(ast: VaspAST): void {
    const knownEntities = new Set([
      ...ast.cruds.map((c) => c.entity),
      ...ast.entities.map((e) => e.name),
    ]);
    for (const query of ast.queries) {
      for (const entity of query.entities) {
        if (!knownEntities.has(entity)) {
          this.diagnostics.push({
            code: "E108_UNKNOWN_ENTITY_REF",
            message: `Query '${query.name}' references unknown entity '${entity}'`,
            hint: `Add an entity or crud block for '${entity}', or remove it from the entities list`,
            loc: query.loc,
          });
        }
      }
    }
    for (const action of ast.actions) {
      for (const entity of action.entities) {
        if (!knownEntities.has(entity)) {
          this.diagnostics.push({
            code: "E109_UNKNOWN_ENTITY_REF",
            message: `Action '${action.name}' references unknown entity '${entity}'`,
            hint: `Add an entity or crud block for '${entity}', or remove it from the entities list`,
            loc: action.loc,
          });
        }
      }
    }
  }

  private checkJobExecutors(ast: VaspAST): void {
    for (const job of ast.jobs) {
      if (job.executor !== "PgBoss") {
        this.diagnostics.push({
          code: "E110_UNKNOWN_JOB_EXECUTOR",
          message: `Unknown job executor '${job.executor}' in '${job.name}'`,
          hint: "Supported executors: PgBoss",
          loc: job.loc,
        });
      }
    }
  }

  private checkApiMethods(ast: VaspAST): void {
    const seen = new Set<string>();
    for (const api of ast.apis ?? []) {
      if (!(SUPPORTED_API_METHODS as readonly string[]).includes(api.method)) {
        this.diagnostics.push({
          code: "E116_UNKNOWN_API_METHOD",
          message: `Unknown API method '${api.method}' in '${api.name}'`,
          hint: `Supported methods: ${SUPPORTED_API_METHODS.join(", ")}`,
          loc: api.loc,
        });
      }

      const endpointKey = `${api.method} ${api.path}`;
      if (seen.has(endpointKey)) {
        this.diagnostics.push({
          code: "E117_DUPLICATE_API_ENDPOINT",
          message: `Duplicate api endpoint '${endpointKey}' in '${api.name}'`,
          hint: "Each API endpoint must have a unique method + path combination",
          loc: api.loc,
        });
      }
      seen.add(endpointKey);
    }
  }

  private checkMiddlewareScopes(ast: VaspAST): void {
    for (const middleware of ast.middlewares ?? []) {
      if (
        !(SUPPORTED_MIDDLEWARE_SCOPES as readonly string[]).includes(
          middleware.scope,
        )
      ) {
        this.diagnostics.push({
          code: "E121_UNKNOWN_MIDDLEWARE_SCOPE",
          message: `Unknown middleware scope '${middleware.scope}' in '${middleware.name}'`,
          hint: `Supported scopes: ${SUPPORTED_MIDDLEWARE_SCOPES.join(", ")}`,
          loc: middleware.loc,
        });
      }
    }
  }

  private checkEnvSchema(ast: VaspAST): void {
    const envSchema = ast.app?.env ?? {};
    const envKeyPattern = /^[A-Z][A-Z0-9_]*$/;
    const numericOnlyTypes = new Set(["Int", "Boolean"]);
    const stringOnlyValidators = new Set([
      "minLength",
      "maxLength",
      "startsWith",
      "endsWith",
    ]);
    const numericValidators = new Set(["min", "max"]);

    for (const [envKey, def] of Object.entries(envSchema)) {
      if (!envKeyPattern.test(envKey)) {
        this.diagnostics.push({
          code: "E122_INVALID_ENV_KEY",
          message: `Invalid env key '${envKey}' in app.env`,
          hint: "Use uppercase env names like DATABASE_URL or JWT_SECRET",
          loc: ast.app.loc,
        });
      }

      // @default value for Enum must be one of the declared variants
      if (
        def.type === "Enum" &&
        def.defaultValue !== undefined &&
        def.enumValues
      ) {
        if (!def.enumValues.includes(def.defaultValue)) {
          this.diagnostics.push({
            code: "E123_INVALID_ENV_DEFAULT",
            message: `Default value '${def.defaultValue}' for '${envKey}' is not a valid enum variant`,
            hint: `Valid variants: ${def.enumValues.join(", ")}`,
            loc: ast.app.loc,
          });
        }
      }

      // @default value for Int must be numeric
      if (def.type === "Int" && def.defaultValue !== undefined) {
        if (isNaN(Number(def.defaultValue))) {
          this.diagnostics.push({
            code: "E124_INVALID_ENV_DEFAULT_TYPE",
            message: `Default value '${def.defaultValue}' for '${envKey}' must be an integer`,
            hint: "Example: MAX_SIZE: optional Int @default(1024)",
            loc: ast.app.loc,
          });
        }
      }

      // @default value for Boolean must be "true" or "false"
      if (def.type === "Boolean" && def.defaultValue !== undefined) {
        if (def.defaultValue !== "true" && def.defaultValue !== "false") {
          this.diagnostics.push({
            code: "E124_INVALID_ENV_DEFAULT_TYPE",
            message: `Default value '${def.defaultValue}' for '${envKey}' must be "true" or "false"`,
            hint: "Example: ENABLE_FEATURE: optional Boolean @default(false)",
            loc: ast.app.loc,
          });
        }
      }

      if (def.validation) {
        const v = def.validation;
        // String-only validators used on non-String types
        if (numericOnlyTypes.has(def.type)) {
          for (const sv of stringOnlyValidators) {
            if (sv in v) {
              this.diagnostics.push({
                code: "E125_INCOMPATIBLE_ENV_VALIDATOR",
                message: `Validator @${sv} is not valid for ${def.type} env var '${envKey}'`,
                hint: `@${sv} can only be used on String or Enum env vars`,
                loc: ast.app.loc,
              });
            }
          }
        }
        // Numeric validators used on non-Int types
        if (def.type !== "Int") {
          for (const nv of numericValidators) {
            if (nv in v) {
              this.diagnostics.push({
                code: "E125_INCOMPATIBLE_ENV_VALIDATOR",
                message: `Validator @${nv} is not valid for ${def.type} env var '${envKey}'`,
                hint: `@${nv} can only be used on Int env vars`,
                loc: ast.app.loc,
              });
            }
          }
        }
      }
    }
  }

  private checkDuplicateEntities(ast: VaspAST): void {
    const seen = new Set<string>();
    for (const entity of ast.entities) {
      if (seen.has(entity.name)) {
        this.diagnostics.push({
          code: "E112_DUPLICATE_ENTITY",
          message: `Duplicate entity '${entity.name}'`,
          hint: `Each entity name must be unique`,
          loc: entity.loc,
        });
      }
      seen.add(entity.name);
    }
  }

  private checkDuplicateRoutes(ast: VaspAST): void {
    const seenPaths = new Set<string>();
    for (const route of ast.routes) {
      if (seenPaths.has(route.path)) {
        this.diagnostics.push({
          code: "E113_DUPLICATE_ROUTE_PATH",
          message: `Duplicate route path '${route.path}' in '${route.name}'`,
          hint: `Each route path must be unique`,
          loc: route.loc,
        });
      }
      seenPaths.add(route.path);
    }
  }

  private checkFieldTypes(ast: VaspAST): void {
    const entityNames = new Set(ast.entities.map((e) => e.name));

    for (const entity of ast.entities) {
      for (const field of entity.fields) {
        if (field.isRelation) {
          // Relation field: the referenced type must be a declared entity
          if (field.relatedEntity && !entityNames.has(field.relatedEntity)) {
            this.diagnostics.push({
              code: "E115_UNDEFINED_RELATION_ENTITY",
              message: `Field '${field.name}' in entity '${entity.name}' references undefined entity '${field.relatedEntity}'`,
              hint: `Add an entity block for '${field.relatedEntity}', or use a primitive type: ${SUPPORTED_FIELD_TYPES.join(", ")}`,
              loc: entity.loc,
            });
          }
        } else {
          // Primitive field: must be in SUPPORTED_FIELD_TYPES
          if (
            !(SUPPORTED_FIELD_TYPES as readonly string[]).includes(field.type)
          ) {
            this.diagnostics.push({
              code: "E114_INVALID_FIELD_TYPE",
              message: `Invalid field type '${field.type}' for field '${field.name}' in entity '${entity.name}'`,
              hint: `Supported types: ${SUPPORTED_FIELD_TYPES.join(", ")}`,
              loc: entity.loc,
            });
          }
        }
      }
    }
  }

  /** 2.2 — Warn on singular-looking relation that may need [] + 2.3 — Warn on missing @onDelete for non-nullable relations */
  private checkRelationModifiers(ast: VaspAST): void {
    for (const entity of ast.entities) {
      for (const field of entity.fields) {
        if (!field.isRelation) continue;

        // E116: @manyToMany must be used on an array relation field (Type[])
        if (field.isManyToMany && !field.isArray) {
          this.diagnostics.push({
            code: "E116_MANY_TO_MANY_REQUIRES_ARRAY",
            message: `Field '${field.name}' in entity '${entity.name}' has @manyToMany but is not an array type`,
            hint: `Change the field type to an array: ${field.name}: ${field.type}[] @manyToMany`,
            loc: entity.loc,
          });
        }

        // 2.2: Warn only when the field name is exactly the lowercased entity name + 's'
        // (e.g. `todos: Todo` looks plural, but `address: Address` does not)
        // Skip this check for @manyToMany fields — they are always arrays by definition
        const entityLower =
          field.relatedEntity!.charAt(0).toLowerCase() +
          field.relatedEntity!.slice(1);
        if (
          !field.isArray &&
          !field.isManyToMany &&
          field.name === entityLower + "s"
        ) {
          this.diagnostics.push({
            code: "W200_SINGULAR_RELATION_LOOKS_PLURAL",
            message: `Relation field '${field.name}' in entity '${entity.name}' looks plural but is not an array`,
            hint: `If this is a collection, add []: ${field.name}: ${field.type}[]. If it is a singular relation, consider renaming it.`,
            loc: entity.loc,
          });
        }

        // 2.3: Warn if non-nullable, non-array relation has no @onDelete
        // @manyToMany fields never carry a FK column, so skip this warning for them
        if (
          !field.isArray &&
          !field.nullable &&
          !field.onDelete &&
          !field.isManyToMany
        ) {
          this.diagnostics.push({
            code: "W201_MISSING_ON_DELETE",
            message: `Relation field '${field.name}' in entity '${entity.name}' has no @onDelete modifier`,
            hint: `Add @onDelete(cascade), @onDelete(restrict), or @onDelete(setNull) to specify deletion behavior`,
            loc: entity.loc,
          });
        }
      }
    }
  }

  /** 2.4 — Validate modifier-type constraints */
  private checkModifierTypeConstraints(ast: VaspAST): void {
    for (const entity of ast.entities) {
      let idCount = 0;

      for (const field of entity.fields) {
        if (field.modifiers.includes("id")) {
          idCount++;
        }

        // @updatedAt only valid on DateTime fields
        if (field.isUpdatedAt && field.type !== "DateTime") {
          this.diagnostics.push({
            code: "E151_UPDATEDAT_REQUIRES_DATETIME",
            message: `Field '${field.name}' in entity '${entity.name}' has @updatedAt but type is '${field.type}'`,
            hint: `@updatedAt can only be used on DateTime fields`,
            loc: entity.loc,
          });
        }

        // @onDelete only valid on relation fields
        if (field.onDelete && !field.isRelation) {
          this.diagnostics.push({
            code: "E152_ONDELETE_REQUIRES_RELATION",
            message: `Field '${field.name}' in entity '${entity.name}' has @onDelete but is not a relation`,
            hint: `@onDelete can only be used on relation fields`,
            loc: entity.loc,
          });
        }
      }

      // Only one @id per entity
      if (idCount > 1) {
        this.diagnostics.push({
          code: "E153_MULTIPLE_ID_FIELDS",
          message: `Entity '${entity.name}' has ${idCount} @id fields`,
          hint: `Each entity must have at most one @id field`,
          loc: entity.loc,
        });
      }
    }
  }

  /** Detect duplicate names across all block types */
  private checkDuplicateBlocks(ast: VaspAST): void {
    this.checkDuplicateNames("query", "E124_DUPLICATE_QUERY", ast.queries);
    this.checkDuplicateNames("action", "E125_DUPLICATE_ACTION", ast.actions);
    this.checkDuplicateNames("page", "E126_DUPLICATE_PAGE", ast.pages);
    this.checkDuplicateNames("crud", "E127_DUPLICATE_CRUD", ast.cruds);
    this.checkDuplicateNames(
      "realtime",
      "E128_DUPLICATE_REALTIME",
      ast.realtimes,
    );
    this.checkDuplicateNames("job", "E129_DUPLICATE_JOB", ast.jobs);
    this.checkDuplicateNames(
      "middleware",
      "E130_DUPLICATE_MIDDLEWARE",
      ast.middlewares ?? [],
    );
  }

  private checkDuplicateNames(
    kind: string,
    code: string,
    nodes: Array<{ name: string; loc: SourceLocation }>,
  ): void {
    const seen = new Set<string>();
    for (const node of nodes) {
      if (seen.has(node.name)) {
        this.diagnostics.push({
          code,
          message: `Duplicate ${kind} '${node.name}'`,
          hint: `Each ${kind} name must be unique`,
          loc: node.loc,
        });
      }
      seen.add(node.name);
    }
  }

  /**
   * E154 — Validate that @validate(...) rules are compatible with the field type.
   * String/Text fields support: email, url, uuid, minLength, maxLength
   * Int/Float fields support: min, max
   * Other types (Boolean, DateTime, Enum, Json, relations) do not support @validate.
   */
  private checkFieldValidation(ast: VaspAST): void {
    const stringTextRules = new Set([
      "email",
      "url",
      "uuid",
      "minLength",
      "maxLength",
    ]);
    const numericRules = new Set(["min", "max"]);
    const noValidationTypes = new Set([
      "Boolean",
      "DateTime",
      "Json",
      "Enum",
      "File",
    ]);

    for (const entity of ast.entities) {
      for (const field of entity.fields) {
        const vld = field.validation;
        if (!vld) continue;

        const usedRules = [
          vld.email ? "email" : null,
          vld.url ? "url" : null,
          vld.uuid ? "uuid" : null,
          vld.minLength != null ? "minLength" : null,
          vld.maxLength != null ? "maxLength" : null,
          vld.min != null ? "min" : null,
          vld.max != null ? "max" : null,
        ].filter(Boolean) as string[];

        if (usedRules.length === 0) continue;

        if (field.isRelation) {
          this.diagnostics.push({
            code: "E154_VALIDATE_ON_RELATION",
            message: `Field '${field.name}' in entity '${entity.name}' has @validate but is a relation field`,
            hint: "@validate can only be used on primitive (non-relation) fields",
            loc: entity.loc,
          });
          continue;
        }

        if (noValidationTypes.has(field.type)) {
          this.diagnostics.push({
            code: "E154_VALIDATE_UNSUPPORTED_TYPE",
            message: `Field '${field.name}' in entity '${entity.name}' has @validate but type '${field.type}' does not support validation rules`,
            hint: "@validate is supported on String, Text, Int, and Float fields",
            loc: entity.loc,
          });
          continue;
        }

        const isStringType = field.type === "String" || field.type === "Text";
        const isNumericType = field.type === "Int" || field.type === "Float";

        if (isStringType) {
          for (const rule of usedRules) {
            if (!stringTextRules.has(rule)) {
              this.diagnostics.push({
                code: "E154_VALIDATE_INCOMPATIBLE_RULE",
                message: `Validation rule '${rule}' is not compatible with ${field.type} field '${field.name}' in entity '${entity.name}'`,
                hint: `String/Text fields support: email, url, uuid, minLength, maxLength`,
                loc: entity.loc,
              });
            }
          }
          // email, url, uuid are mutually exclusive
          const formatFlags = [vld.email, vld.url, vld.uuid].filter(Boolean);
          if (formatFlags.length > 1) {
            this.diagnostics.push({
              code: "E154_VALIDATE_EXCLUSIVE_FLAGS",
              message: `Field '${field.name}' in entity '${entity.name}' has multiple exclusive format validators`,
              hint: "Only one of: email, url, uuid can be used per field",
              loc: entity.loc,
            });
          }
          // minLength must not exceed maxLength
          if (
            vld.minLength != null &&
            vld.maxLength != null &&
            vld.minLength > vld.maxLength
          ) {
            this.diagnostics.push({
              code: "E154_VALIDATE_LENGTH_ORDER",
              message: `Field '${field.name}' in entity '${entity.name}' has minLength (${vld.minLength}) greater than maxLength (${vld.maxLength})`,
              hint: "minLength must be less than or equal to maxLength",
              loc: entity.loc,
            });
          }
        } else if (isNumericType) {
          for (const rule of usedRules) {
            if (!numericRules.has(rule)) {
              this.diagnostics.push({
                code: "E154_VALIDATE_INCOMPATIBLE_RULE",
                message: `Validation rule '${rule}' is not compatible with ${field.type} field '${field.name}' in entity '${entity.name}'`,
                hint: `Int/Float fields support: min, max`,
                loc: entity.loc,
              });
            }
          }
          // min must not exceed max
          if (vld.min != null && vld.max != null && vld.min > vld.max) {
            this.diagnostics.push({
              code: "E154_VALIDATE_RANGE_ORDER",
              message: `Field '${field.name}' in entity '${entity.name}' has min (${vld.min}) greater than max (${vld.max})`,
              hint: "min must be less than or equal to max",
              loc: entity.loc,
            });
          }
        }
      }
    }
  }

  private checkAdminEntities(ast: VaspAST): void {
    if (!ast.admin) return;

    if (ast.admin.entities.length === 0) {
      this.diagnostics.push({
        code: "E131_EMPTY_ADMIN_ENTITIES",
        message: "admin block has no entities",
        hint: "Add at least one entity: entities: [User, Todo]",
        loc: ast.admin.loc,
      });
      return;
    }

    const knownEntities = new Set(ast.entities.map((e) => e.name));
    for (const entityName of ast.admin.entities) {
      if (!knownEntities.has(entityName)) {
        this.diagnostics.push({
          code: "E132_ADMIN_ENTITY_NOT_DECLARED",
          message: `admin block references entity '${entityName}' which has no entity block`,
          hint: `Add an entity block for '${entityName}', or remove it from the admin entities list`,
          loc: ast.admin.loc,
        });
      }
    }
  }

  private checkStorageBlocks(ast: VaspAST): void {
    const seen = new Set<string>();
    for (const storage of ast.storages ?? []) {
      // Duplicate storage block names
      if (seen.has(storage.name)) {
        this.diagnostics.push({
          code: "E160_DUPLICATE_STORAGE",
          message: `Duplicate storage block '${storage.name}'`,
          hint: "Each storage block name must be unique",
          loc: storage.loc,
        });
      }
      seen.add(storage.name);

      // Validate provider
      if (
        !(SUPPORTED_STORAGE_PROVIDERS as readonly string[]).includes(
          storage.provider,
        )
      ) {
        this.diagnostics.push({
          code: "E161_UNKNOWN_STORAGE_PROVIDER",
          message: `Unknown storage provider '${storage.provider}' in '${storage.name}'`,
          hint: `Supported providers: ${SUPPORTED_STORAGE_PROVIDERS.join(", ")}`,
          loc: storage.loc,
        });
      }

      // Cloud providers require a bucket
      const cloudProviders = ["s3", "r2", "gcs"];
      if (cloudProviders.includes(storage.provider) && !storage.bucket) {
        this.diagnostics.push({
          code: "E162_STORAGE_REQUIRES_BUCKET",
          message: `Storage block '${storage.name}' uses provider '${storage.provider}' but has no bucket`,
          hint: `Add: bucket: "my-bucket-name"`,
          loc: storage.loc,
        });
      }
    }
  }

  private checkStorageFieldRefs(ast: VaspAST): void {
    const storageNames = new Set((ast.storages ?? []).map((s) => s.name));

    for (const entity of ast.entities) {
      for (const field of entity.fields) {
        if (field.type !== "File") continue;

        // File fields should reference a declared storage block
        if (field.storageBlock && !storageNames.has(field.storageBlock)) {
          this.diagnostics.push({
            code: "E163_UNKNOWN_STORAGE_REF",
            message: `Field '${field.name}' in entity '${entity.name}' references undefined storage block '${field.storageBlock}'`,
            hint: `Add a storage block named '${field.storageBlock}', or fix the @storage() modifier`,
            loc: entity.loc,
          });
        }
      }
    }
  }

  private checkEntityIndexFields(ast: VaspAST): void {
    for (const entity of ast.entities) {
      // Build a set of scalar field names (including auto FK columns for relations)
      const fieldNames = new Set<string>();
      for (const f of entity.fields) {
        if (f.isRelation && !f.isArray) {
          // Many-to-one → FK column is named {fieldName}Id
          fieldNames.add(`${f.name}Id`);
        } else if (!f.isArray) {
          fieldNames.add(f.name);
        }
      }
      // Also allow createdAt / updatedAt (auto-appended by template)
      fieldNames.add("createdAt");
      fieldNames.add("updatedAt");

      for (const idx of entity.indexes ?? []) {
        for (const field of idx.fields) {
          if (!fieldNames.has(field)) {
            this.diagnostics.push({
              code: "E170_INDEX_UNKNOWN_FIELD",
              message: `@@index on entity '${entity.name}' references unknown field '${field}'`,
              hint: `Field '${field}' is not declared in entity '${entity.name}'`,
              loc: entity.loc,
            });
          }
        }
      }

      for (const uc of entity.uniqueConstraints ?? []) {
        for (const field of uc.fields) {
          if (!fieldNames.has(field)) {
            this.diagnostics.push({
              code: "E171_UNIQUE_CONSTRAINT_UNKNOWN_FIELD",
              message: `@@unique on entity '${entity.name}' references unknown field '${field}'`,
              hint: `Field '${field}' is not declared in entity '${entity.name}'`,
              loc: entity.loc,
            });
          }
        }
      }
    }
  }

  private checkEmailProviders(ast: VaspAST): void {
    for (const email of ast.emails ?? []) {
      if (
        !(SUPPORTED_EMAIL_PROVIDERS as readonly string[]).includes(
          email.provider,
        )
      ) {
        this.diagnostics.push({
          code: "E115_UNKNOWN_EMAIL_PROVIDER",
          message: `Unknown email provider '${email.provider}' in '${email.name}'`,
          hint: `Supported providers: ${SUPPORTED_EMAIL_PROVIDERS.join(", ")}`,
          loc: email.loc,
        });
      }
    }
  }

  private checkEmailOnSuccess(ast: VaspAST): void {
    // Build a set of all template names across all email blocks
    const allTemplateNames = new Set<string>();
    for (const email of ast.emails ?? []) {
      for (const tpl of email.templates) {
        allTemplateNames.add(tpl.name);
      }
    }

    for (const action of ast.actions) {
      const templateName = action.onSuccess?.sendEmail;
      if (!templateName) continue;

      if ((ast.emails ?? []).length === 0) {
        this.diagnostics.push({
          code: "E116_SEND_EMAIL_NO_EMAIL_BLOCK",
          message: `Action '${action.name}' uses onSuccess.sendEmail but no email block is defined`,
          hint: "Add an email block with a templates section",
          loc: action.loc,
        });
        continue;
      }

      if (!allTemplateNames.has(templateName)) {
        this.diagnostics.push({
          code: "E117_UNKNOWN_EMAIL_TEMPLATE_REF",
          message: `Action '${action.name}' references unknown email template '${templateName}'`,
          hint: `Define a template named '${templateName}' in an email block`,
          loc: action.loc,
        });
      }
    }
  }

  private checkMultiTenantConfig(ast: VaspAST): void {
    const mt = ast.app?.multiTenant;
    if (!mt) return;

    // Validate strategy value
    if (!(SUPPORTED_MULTI_TENANT_STRATEGIES as readonly string[]).includes(mt.strategy)) {
      this.diagnostics.push({
        code: "E180_INVALID_MULTITENANT_STRATEGY",
        message: `Invalid multiTenant strategy '${mt.strategy}'`,
        hint: `Supported strategies: ${SUPPORTED_MULTI_TENANT_STRATEGIES.join(", ")}`,
        loc: ast.app.loc,
      });
    }

    // Validate tenantEntity references a declared entity
    if (mt.tenantEntity) {
      const entityNames = new Set(ast.entities.map((e) => e.name));
      if (!entityNames.has(mt.tenantEntity)) {
        this.diagnostics.push({
          code: "E181_MULTITENANT_ENTITY_NOT_DECLARED",
          message: `multiTenant.tenantEntity '${mt.tenantEntity}' has no entity block`,
          hint: `Add an entity block for '${mt.tenantEntity}', or fix the tenantEntity value`,
          loc: ast.app.loc,
        });
      }
    }

    // Validate tenantField exists on at least one entity (only for row-level strategy)
    if (mt.strategy === "row-level" && mt.tenantField && mt.tenantEntity) {
      const tenantEntityNode = ast.entities.find((e) => e.name === mt.tenantEntity);
      if (tenantEntityNode) {
        // The tenantField should be a field on the tenant entity itself (it is the PK)
        const hasTenantPk = tenantEntityNode.fields.some(
          (f) => f.name === "id" || f.modifiers.includes("id"),
        );
        if (!hasTenantPk) {
          this.diagnostics.push({
            code: "E182_MULTITENANT_ENTITY_NO_ID",
            message: `multiTenant.tenantEntity '${mt.tenantEntity}' has no @id field`,
            hint: "Add an id field with @id modifier to the tenant entity",
            loc: ast.app.loc,
          });
        }
      }
    }
  }
}
