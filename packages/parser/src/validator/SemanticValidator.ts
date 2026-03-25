import type { ParseDiagnostic, SourceLocation, VaspAST } from '@vasp-framework/core'
import { ParseError, SUPPORTED_API_METHODS, SUPPORTED_AUTH_METHODS, SUPPORTED_CRUD_OPERATIONS, SUPPORTED_MIDDLEWARE_SCOPES, SUPPORTED_REALTIME_EVENTS, SUPPORTED_FIELD_TYPES } from '@vasp-framework/core'

export class SemanticValidator {
  private readonly diagnostics: ParseDiagnostic[] = []

  validate(ast: VaspAST): void {
    this.checkAppExists(ast)
    this.checkDuplicateEntities(ast)
    this.checkDuplicateRoutes(ast)
    this.checkDuplicateBlocks(ast)
    this.checkRouteTargets(ast)
    this.checkCrudEntities(ast)
    this.checkCrudOperations(ast)
    this.checkRealtimeEntities(ast)
    this.checkAuthMethods(ast)
    this.checkRoleConfiguration(ast)
    this.checkQueryActionEntities(ast)
    this.checkApiMethods(ast)
    this.checkMiddlewareScopes(ast)
    this.checkEnvSchema(ast)
    this.checkJobExecutors(ast)
    this.checkFieldTypes(ast)
    this.checkRelationModifiers(ast)
    this.checkModifierTypeConstraints(ast)
    this.checkAdminEntities(ast)

    const hasErrors = this.diagnostics.some((d) => d.code.startsWith('E'))
    if (hasErrors) {
      throw new ParseError(this.diagnostics)
    }
  }

  private checkAppExists(ast: VaspAST): void {
    if (!ast.app) {
      this.diagnostics.push({
        code: 'E100_MISSING_APP_BLOCK',
        message: 'No app block found in main.vasp',
        hint: 'Every Vasp project requires exactly one app { } block',
      })
    }
  }

  private checkRouteTargets(ast: VaspAST): void {
    const pageNames = new Set(ast.pages.map((p) => p.name))
    for (const route of ast.routes) {
      if (!pageNames.has(route.to)) {
        this.diagnostics.push({
          code: 'E101_UNKNOWN_PAGE_REF',
          message: `Route '${route.name}' references unknown page '${route.to}'`,
          hint: `Add a page block named '${route.to}', or fix the 'to' value in route '${route.name}'`,
          loc: route.loc,
        })
      }
    }
  }

  private checkCrudEntities(ast: VaspAST): void {
    if (ast.entities.length === 0) return
    const entityNames = new Set(ast.entities.map((e) => e.name))
    for (const crud of ast.cruds) {
      if (!entityNames.has(crud.entity)) {
        this.diagnostics.push({
          code: 'E111_CRUD_ENTITY_NOT_DECLARED',
          message: `crud '${crud.name}' references entity '${crud.entity}' which has no entity block`,
          hint: `Add an entity block for '${crud.entity}', or remove the crud block`,
          loc: crud.loc,
        })
      }
    }
  }

  private checkCrudOperations(ast: VaspAST): void {
    for (const crud of ast.cruds) {
      if (crud.operations.length === 0) {
        this.diagnostics.push({
          code: 'E102_EMPTY_CRUD_OPERATIONS',
          message: `crud '${crud.name}' has no operations`,
          hint: 'Add at least one operation: operations: [list, create, update, delete]',
          loc: crud.loc,
        })
      }
      for (const op of crud.operations) {
        if (!(SUPPORTED_CRUD_OPERATIONS as readonly string[]).includes(op)) {
          this.diagnostics.push({
            code: 'E103_UNKNOWN_CRUD_OPERATION',
            message: `Unknown crud operation '${op}' in '${crud.name}'`,
            hint: `Supported operations: ${SUPPORTED_CRUD_OPERATIONS.join(', ')}`,
            loc: crud.loc,
          })
        }
      }
    }
  }

  private checkRealtimeEntities(ast: VaspAST): void {
    const crudEntities = new Set(ast.cruds.map((c) => c.entity))
    for (const rt of ast.realtimes) {
      if (!crudEntities.has(rt.entity)) {
        this.diagnostics.push({
          code: 'E104_REALTIME_ENTITY_NOT_CRUD',
          message: `realtime '${rt.name}' references entity '${rt.entity}' which has no crud block`,
          hint: `Add a crud block for entity '${rt.entity}', or remove the realtime block`,
          loc: rt.loc,
        })
      }
      for (const event of rt.events) {
        if (!(SUPPORTED_REALTIME_EVENTS as readonly string[]).includes(event)) {
          this.diagnostics.push({
            code: 'E105_UNKNOWN_REALTIME_EVENT',
            message: `Unknown realtime event '${event}' in '${rt.name}'`,
            hint: `Supported events: ${SUPPORTED_REALTIME_EVENTS.join(', ')}`,
            loc: rt.loc,
          })
        }
      }
    }
  }

  private checkAuthMethods(ast: VaspAST): void {
    if (!ast.auth) return
    if (ast.auth.methods.length === 0) {
      this.diagnostics.push({
        code: 'E106_EMPTY_AUTH_METHODS',
        message: `auth '${ast.auth.name}' has no methods`,
        hint: `Add at least one method: methods: [usernameAndPassword]`,
        loc: ast.auth.loc,
      })
    }
    for (const method of ast.auth.methods) {
      if (!(SUPPORTED_AUTH_METHODS as readonly string[]).includes(method)) {
        this.diagnostics.push({
          code: 'E107_UNKNOWN_AUTH_METHOD',
          message: `Unknown auth method '${method}'`,
          hint: `Supported methods: ${SUPPORTED_AUTH_METHODS.join(', ')}`,
          loc: ast.auth.loc,
        })
      }
    }
  }

  private checkRoleConfiguration(ast: VaspAST): void {
    const configuredRoles = new Set(ast.auth?.roles ?? [])

    if ((ast.auth?.roles ?? []).length === 0) {
      for (const query of ast.queries) {
        if ((query.roles ?? []).length > 0) {
          this.diagnostics.push({
            code: 'E118_ROLES_WITHOUT_AUTH_CONFIG',
            message: `Query '${query.name}' declares roles but auth.roles is not configured`,
            hint: 'Define roles in auth block: roles: [admin, ...]',
            loc: query.loc,
          })
        }
      }
      for (const action of ast.actions) {
        if ((action.roles ?? []).length > 0) {
          this.diagnostics.push({
            code: 'E118_ROLES_WITHOUT_AUTH_CONFIG',
            message: `Action '${action.name}' declares roles but auth.roles is not configured`,
            hint: 'Define roles in auth block: roles: [admin, ...]',
            loc: action.loc,
          })
        }
      }
      for (const api of ast.apis ?? []) {
        if ((api.roles ?? []).length > 0) {
          this.diagnostics.push({
            code: 'E118_ROLES_WITHOUT_AUTH_CONFIG',
            message: `Api '${api.name}' declares roles but auth.roles is not configured`,
            hint: 'Define roles in auth block: roles: [admin, ...]',
            loc: api.loc,
          })
        }
      }
    }

    for (const query of ast.queries) {
      if ((query.roles ?? []).length > 0 && !query.auth) {
        this.diagnostics.push({
          code: 'E119_ROLES_REQUIRE_AUTH',
          message: `Query '${query.name}' declares roles but auth is false`,
          hint: 'Set auth: true when using roles',
          loc: query.loc,
        })
      }
      for (const role of query.roles ?? []) {
        if (!configuredRoles.has(role)) {
          this.diagnostics.push({
            code: 'E120_UNKNOWN_ROLE_REF',
            message: `Query '${query.name}' references unknown role '${role}'`,
            hint: `Define '${role}' in auth.roles`,
            loc: query.loc,
          })
        }
      }
    }

    for (const action of ast.actions) {
      if ((action.roles ?? []).length > 0 && !action.auth) {
        this.diagnostics.push({
          code: 'E119_ROLES_REQUIRE_AUTH',
          message: `Action '${action.name}' declares roles but auth is false`,
          hint: 'Set auth: true when using roles',
          loc: action.loc,
        })
      }
      for (const role of action.roles ?? []) {
        if (!configuredRoles.has(role)) {
          this.diagnostics.push({
            code: 'E120_UNKNOWN_ROLE_REF',
            message: `Action '${action.name}' references unknown role '${role}'`,
            hint: `Define '${role}' in auth.roles`,
            loc: action.loc,
          })
        }
      }
    }

    for (const api of ast.apis ?? []) {
      if ((api.roles ?? []).length > 0 && !api.auth) {
        this.diagnostics.push({
          code: 'E119_ROLES_REQUIRE_AUTH',
          message: `Api '${api.name}' declares roles but auth is false`,
          hint: 'Set auth: true when using roles',
          loc: api.loc,
        })
      }
      for (const role of api.roles ?? []) {
        if (!configuredRoles.has(role)) {
          this.diagnostics.push({
            code: 'E120_UNKNOWN_ROLE_REF',
            message: `Api '${api.name}' references unknown role '${role}'`,
            hint: `Define '${role}' in auth.roles`,
            loc: api.loc,
          })
        }
      }
    }
  }

  private checkQueryActionEntities(ast: VaspAST): void {
    const knownEntities = new Set([
      ...ast.cruds.map((c) => c.entity),
      ...ast.entities.map((e) => e.name),
    ])
    for (const query of ast.queries) {
      for (const entity of query.entities) {
        if (!knownEntities.has(entity)) {
          this.diagnostics.push({
            code: 'E108_UNKNOWN_ENTITY_REF',
            message: `Query '${query.name}' references unknown entity '${entity}'`,
            hint: `Add an entity or crud block for '${entity}', or remove it from the entities list`,
            loc: query.loc,
          })
        }
      }
    }
    for (const action of ast.actions) {
      for (const entity of action.entities) {
        if (!knownEntities.has(entity)) {
          this.diagnostics.push({
            code: 'E109_UNKNOWN_ENTITY_REF',
            message: `Action '${action.name}' references unknown entity '${entity}'`,
            hint: `Add an entity or crud block for '${entity}', or remove it from the entities list`,
            loc: action.loc,
          })
        }
      }
    }
  }

  private checkJobExecutors(ast: VaspAST): void {
    for (const job of ast.jobs) {
      if (job.executor !== 'PgBoss') {
        this.diagnostics.push({
          code: 'E110_UNKNOWN_JOB_EXECUTOR',
          message: `Unknown job executor '${job.executor}' in '${job.name}'`,
          hint: 'Supported executors: PgBoss',
          loc: job.loc,
        })
      }
    }
  }

  private checkApiMethods(ast: VaspAST): void {
    const seen = new Set<string>()
    for (const api of ast.apis ?? []) {
      if (!(SUPPORTED_API_METHODS as readonly string[]).includes(api.method)) {
        this.diagnostics.push({
          code: 'E116_UNKNOWN_API_METHOD',
          message: `Unknown API method '${api.method}' in '${api.name}'`,
          hint: `Supported methods: ${SUPPORTED_API_METHODS.join(', ')}`,
          loc: api.loc,
        })
      }

      const endpointKey = `${api.method} ${api.path}`
      if (seen.has(endpointKey)) {
        this.diagnostics.push({
          code: 'E117_DUPLICATE_API_ENDPOINT',
          message: `Duplicate api endpoint '${endpointKey}' in '${api.name}'`,
          hint: 'Each API endpoint must have a unique method + path combination',
          loc: api.loc,
        })
      }
      seen.add(endpointKey)
    }
  }

  private checkMiddlewareScopes(ast: VaspAST): void {
    for (const middleware of ast.middlewares ?? []) {
      if (!(SUPPORTED_MIDDLEWARE_SCOPES as readonly string[]).includes(middleware.scope)) {
        this.diagnostics.push({
          code: 'E121_UNKNOWN_MIDDLEWARE_SCOPE',
          message: `Unknown middleware scope '${middleware.scope}' in '${middleware.name}'`,
          hint: `Supported scopes: ${SUPPORTED_MIDDLEWARE_SCOPES.join(', ')}`,
          loc: middleware.loc,
        })
      }
    }
  }

  private checkEnvSchema(ast: VaspAST): void {
    const envSchema = ast.app?.env ?? {}
    const envKeyPattern = /^[A-Z][A-Z0-9_]*$/
    for (const envKey of Object.keys(envSchema)) {
      if (!envKeyPattern.test(envKey)) {
        this.diagnostics.push({
          code: 'E122_INVALID_ENV_KEY',
          message: `Invalid env key '${envKey}' in app.env`,
          hint: 'Use uppercase env names like DATABASE_URL or JWT_SECRET',
          loc: ast.app.loc,
        })
      }
    }
  }

  private checkDuplicateEntities(ast: VaspAST): void {
    const seen = new Set<string>()
    for (const entity of ast.entities) {
      if (seen.has(entity.name)) {
        this.diagnostics.push({
          code: 'E112_DUPLICATE_ENTITY',
          message: `Duplicate entity '${entity.name}'`,
          hint: `Each entity name must be unique`,
          loc: entity.loc,
        })
      }
      seen.add(entity.name)
    }
  }

  private checkDuplicateRoutes(ast: VaspAST): void {
    const seenPaths = new Set<string>()
    for (const route of ast.routes) {
      if (seenPaths.has(route.path)) {
        this.diagnostics.push({
          code: 'E113_DUPLICATE_ROUTE_PATH',
          message: `Duplicate route path '${route.path}' in '${route.name}'`,
          hint: `Each route path must be unique`,
          loc: route.loc,
        })
      }
      seenPaths.add(route.path)
    }
  }

  private checkFieldTypes(ast: VaspAST): void {
    const entityNames = new Set(ast.entities.map((e) => e.name))

    for (const entity of ast.entities) {
      for (const field of entity.fields) {
        if (field.isRelation) {
          // Relation field: the referenced type must be a declared entity
          if (field.relatedEntity && !entityNames.has(field.relatedEntity)) {
            this.diagnostics.push({
              code: 'E115_UNDEFINED_RELATION_ENTITY',
              message: `Field '${field.name}' in entity '${entity.name}' references undefined entity '${field.relatedEntity}'`,
              hint: `Add an entity block for '${field.relatedEntity}', or use a primitive type: ${SUPPORTED_FIELD_TYPES.join(', ')}`,
              loc: entity.loc,
            })
          }
        } else {
          // Primitive field: must be in SUPPORTED_FIELD_TYPES
          if (!(SUPPORTED_FIELD_TYPES as readonly string[]).includes(field.type)) {
            this.diagnostics.push({
              code: 'E114_INVALID_FIELD_TYPE',
              message: `Invalid field type '${field.type}' for field '${field.name}' in entity '${entity.name}'`,
              hint: `Supported types: ${SUPPORTED_FIELD_TYPES.join(', ')}`,
              loc: entity.loc,
            })
          }
        }
      }
    }
  }

  /** 2.2 — Warn on singular-looking relation that may need [] + 2.3 — Warn on missing @onDelete for non-nullable relations */
  private checkRelationModifiers(ast: VaspAST): void {
    for (const entity of ast.entities) {
      for (const field of entity.fields) {
        if (!field.isRelation) continue

        // 2.2: Warn only when the field name is exactly the lowercased entity name + 's'
        // (e.g. `todos: Todo` looks plural, but `address: Address` does not)
        const entityLower = field.relatedEntity!.charAt(0).toLowerCase() + field.relatedEntity!.slice(1)
        if (!field.isArray && field.name === entityLower + 's') {
          this.diagnostics.push({
            code: 'W200_SINGULAR_RELATION_LOOKS_PLURAL',
            message: `Relation field '${field.name}' in entity '${entity.name}' looks plural but is not an array`,
            hint: `If this is a collection, add []: ${field.name}: ${field.type}[]. If it is a singular relation, consider renaming it.`,
            loc: entity.loc,
          })
        }

        // 2.3: Warn if non-nullable, non-array relation has no @onDelete
        if (!field.isArray && !field.nullable && !field.onDelete) {
          this.diagnostics.push({
            code: 'W201_MISSING_ON_DELETE',
            message: `Relation field '${field.name}' in entity '${entity.name}' has no @onDelete modifier`,
            hint: `Add @onDelete(cascade), @onDelete(restrict), or @onDelete(setNull) to specify deletion behavior`,
            loc: entity.loc,
          })
        }
      }
    }
  }

  /** 2.4 — Validate modifier-type constraints */
  private checkModifierTypeConstraints(ast: VaspAST): void {
    for (const entity of ast.entities) {
      let idCount = 0

      for (const field of entity.fields) {
        if (field.modifiers.includes('id')) {
          idCount++
        }

        // @updatedAt only valid on DateTime fields
        if (field.isUpdatedAt && field.type !== 'DateTime') {
          this.diagnostics.push({
            code: 'E151_UPDATEDAT_REQUIRES_DATETIME',
            message: `Field '${field.name}' in entity '${entity.name}' has @updatedAt but type is '${field.type}'`,
            hint: `@updatedAt can only be used on DateTime fields`,
            loc: entity.loc,
          })
        }

        // @onDelete only valid on relation fields
        if (field.onDelete && !field.isRelation) {
          this.diagnostics.push({
            code: 'E152_ONDELETE_REQUIRES_RELATION',
            message: `Field '${field.name}' in entity '${entity.name}' has @onDelete but is not a relation`,
            hint: `@onDelete can only be used on relation fields`,
            loc: entity.loc,
          })
        }
      }

      // Only one @id per entity
      if (idCount > 1) {
        this.diagnostics.push({
          code: 'E153_MULTIPLE_ID_FIELDS',
          message: `Entity '${entity.name}' has ${idCount} @id fields`,
          hint: `Each entity must have at most one @id field`,
          loc: entity.loc,
        })
      }
    }
  }

  /** Detect duplicate names across all block types */
  private checkDuplicateBlocks(ast: VaspAST): void {
    this.checkDuplicateNames('query', 'E124_DUPLICATE_QUERY', ast.queries)
    this.checkDuplicateNames('action', 'E125_DUPLICATE_ACTION', ast.actions)
    this.checkDuplicateNames('page', 'E126_DUPLICATE_PAGE', ast.pages)
    this.checkDuplicateNames('crud', 'E127_DUPLICATE_CRUD', ast.cruds)
    this.checkDuplicateNames('realtime', 'E128_DUPLICATE_REALTIME', ast.realtimes)
    this.checkDuplicateNames('job', 'E129_DUPLICATE_JOB', ast.jobs)
    this.checkDuplicateNames('middleware', 'E130_DUPLICATE_MIDDLEWARE', ast.middlewares ?? [])
  }

  private checkDuplicateNames(
    kind: string,
    code: string,
    nodes: Array<{ name: string; loc: SourceLocation }>,
  ): void {
    const seen = new Set<string>()
    for (const node of nodes) {
      if (seen.has(node.name)) {
        this.diagnostics.push({
          code,
          message: `Duplicate ${kind} '${node.name}'`,
          hint: `Each ${kind} name must be unique`,
          loc: node.loc,
        })
      }
      seen.add(node.name)
    }
  }

  private checkAdminEntities(ast: VaspAST): void {
    if (!ast.admin) return

    if (ast.admin.entities.length === 0) {
      this.diagnostics.push({
        code: 'E131_EMPTY_ADMIN_ENTITIES',
        message: 'admin block has no entities',
        hint: 'Add at least one entity: entities: [User, Todo]',
        loc: ast.admin.loc,
      })
      return
    }

    const knownEntities = new Set(ast.entities.map((e) => e.name))
    for (const entityName of ast.admin.entities) {
      if (!knownEntities.has(entityName)) {
        this.diagnostics.push({
          code: 'E132_ADMIN_ENTITY_NOT_DECLARED',
          message: `admin block references entity '${entityName}' which has no entity block`,
          hint: `Add an entity block for '${entityName}', or remove it from the admin entities list`,
          loc: ast.admin.loc,
        })
      }
    }
  }
}
