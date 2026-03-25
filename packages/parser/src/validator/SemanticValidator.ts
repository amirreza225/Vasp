import type { ParseDiagnostic, VaspAST } from '@vasp-framework/core'
import { ParseError, SUPPORTED_API_METHODS, SUPPORTED_AUTH_METHODS, SUPPORTED_CRUD_OPERATIONS, SUPPORTED_MIDDLEWARE_SCOPES, SUPPORTED_REALTIME_EVENTS, SUPPORTED_FIELD_TYPES } from '@vasp-framework/core'

export class SemanticValidator {
  private readonly diagnostics: ParseDiagnostic[] = []

  validate(ast: VaspAST): void {
    this.checkAppExists(ast)
    this.checkRouteTargets(ast)
    this.checkCrudEntities(ast)
    this.checkCrudOperations(ast)
    this.checkRealtimeEntities(ast)
    this.checkAuthMethods(ast)
    this.checkRoleConfiguration(ast)
    this.checkQueryActionEntities(ast)
    this.checkApiMethods(ast)
    this.checkMiddlewareScopes(ast)
    this.checkJobExecutors(ast)
    this.checkDuplicateEntities(ast)
    this.checkDuplicateRoutes(ast)
    this.checkFieldTypes(ast)

    if (this.diagnostics.length > 0) {
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
}
