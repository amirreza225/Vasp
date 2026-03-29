import type {
  AdminNode,
  ApiMethod,
  ApiNode,
  ActionNode,
  ActionOnSuccess,
  AppNode,
  AuthMethod,
  AuthNode,
  AutoPageNode,
  AutoPageType,
  AutoPageRowAction,
  AutoPageTopAction,
  AutoPageLayout,
  CacheNode,  CacheProvider,
  CacheRedisConfig,
  CrudNode,
  CrudListConfig,
  CrudOperation,
  CrudPermissions,
  EmailNode,
  EmailProvider,
  EmailTemplateEntry,
  EntityIndex,
  EntityIndexType,
  EntityNode,
  EntityUniqueConstraint,
  EnvRequirement,
  EnvVarDefinition,
  EnvVarType,
  EnvVarValidation,
  FieldModifier,
  FieldNode,
  FieldValidation,
  ImportExpression,
  JobNode,
  JobRetryConfig,
  JobDeadLetterConfig,
  JobBackoffStrategy,
  MiddlewareNode,
  MiddlewareScope,
  AppUIConfig,
  UITheme,
  UIPrimaryColor,
  MultiTenantConfig,
  MultiTenantStrategy,
  ObservabilityExporter,
  ObservabilityLogsMode,
  ErrorTrackingProvider,
  ObservabilityNode,
  OnDeleteBehavior,
  PageNode,
  PermissionMap,
  QueryCacheConfig,
  QueryNode,
  RealtimeEvent,
  RealtimeNode,
  RouteNode,
  SeedNode,
  SourceLocation,
  StorageNode,
  StorageProvider,
  VaspAST,
  WebhookNode,
  WebhookMode,
  WebhookVerification,
} from "@vasp-framework/core";
import {
  ParseError,
  SUPPORTED_UI_THEMES,
  SUPPORTED_UI_PRIMARY_COLORS,
  SUPPORTED_AUTH_METHODS,
  SUPPORTED_AUTOPAGE_TYPES,
  SUPPORTED_CRUD_OPERATIONS,
  SUPPORTED_JOB_BACKOFF_STRATEGIES,
  SUPPORTED_OBSERVABILITY_EXPORTERS,
  SUPPORTED_ERROR_TRACKING_PROVIDERS,
  SUPPORTED_OBSERVABILITY_LOGS_MODES,
  SUPPORTED_REALTIME_EVENTS,
} from "@vasp-framework/core";
import type { ParseDiagnostic } from "@vasp-framework/core";
import { Lexer } from "../lexer/Lexer.js";
import type { Token } from "../lexer/Token.js";
import { BLOCK_KEYWORDS, TokenType } from "../lexer/TokenType.js";

export function parse(source: string, filename = "main.vasp"): VaspAST {
  const tokens = new Lexer(source, filename).tokenize();
  return new Parser(tokens, filename).parse();
}

/** Extract route params from a path string, e.g. "/users/:id" → ["id"] */
function extractRouteParams(path: string): string[] {
  const matches = path.match(/:([^/]+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

/**
 * Parse the raw content of a @validate(...) modifier into a FieldValidation object.
 * Examples:
 *   "email"                         → { email: true }
 *   "minLength: 3, maxLength: 30"   → { minLength: 3, maxLength: 30 }
 *   "email, minLength: 5"           → { email: true, minLength: 5 }
 *   "min: 0, max: 100"              → { min: 0, max: 100 }
 */
function parseValidateArgs(raw: string): FieldValidation {
  const validation: FieldValidation = {};
  const rules = raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  for (const rule of rules) {
    const colonIdx = rule.indexOf(":");
    if (colonIdx === -1) {
      // Boolean flag: email | url | uuid
      const flag = rule.trim();
      if (flag === "email") validation.email = true;
      else if (flag === "url") validation.url = true;
      else if (flag === "uuid") validation.uuid = true;
    } else {
      // Numeric key-value: minLength: 3 | maxLength: 100 | min: 0 | max: 255
      const key = rule.slice(0, colonIdx).trim();
      const value = rule.slice(colonIdx + 1).trim();
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        if (key === "minLength") validation.minLength = numValue;
        else if (key === "maxLength") validation.maxLength = numValue;
        else if (key === "min") validation.min = numValue;
        else if (key === "max") validation.max = numValue;
      }
    }
  }

  return validation;
}

class Parser {
  private pos = 0;
  private readonly diagnostics: ParseDiagnostic[] = [];

  constructor(
    private readonly tokens: Token[],
    private readonly filename: string,
  ) {}

  // ---- Public ----

  parse(): VaspAST {
    const ast: VaspAST = {
      app: null as unknown as AppNode, // validated by SemanticValidator
      entities: [],
      routes: [],
      pages: [],
      queries: [],
      actions: [],
      cruds: [],
      realtimes: [],
      jobs: [],
      autoPages: [],
    };

    while (!this.isEOF()) {
      const kw = this.peek();

      try {
        switch (kw.type) {
          case TokenType.KW_APP:
            if (ast.app) {
              this.consume(TokenType.KW_APP);
              throw this.error(
                "E043_DUPLICATE_APP_BLOCK",
                "Duplicate app block found",
                "Only one app block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.app = this.parseApp();
            break;
          case TokenType.KW_AUTH:
            if (ast.auth) {
              this.consume(TokenType.KW_AUTH);
              throw this.error(
                "E044_DUPLICATE_AUTH_BLOCK",
                "Duplicate auth block found",
                "Only one auth block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.auth = this.parseAuth();
            break;
          case TokenType.KW_ENTITY:
            ast.entities.push(this.parseEntity());
            break;
          case TokenType.KW_ROUTE:
            ast.routes.push(this.parseRoute());
            break;
          case TokenType.KW_PAGE:
            ast.pages.push(this.parsePage());
            break;
          case TokenType.KW_QUERY:
            ast.queries.push(this.parseQuery());
            break;
          case TokenType.KW_ACTION:
            ast.actions.push(this.parseAction());
            break;
          case TokenType.KW_MIDDLEWARE:
            (ast.middlewares ??= []).push(this.parseMiddleware());
            break;
          case TokenType.KW_API:
            (ast.apis ??= []).push(this.parseApi());
            break;
          case TokenType.KW_CRUD:
            ast.cruds.push(this.parseCrud());
            break;
          case TokenType.KW_REALTIME:
            ast.realtimes.push(this.parseRealtime());
            break;
          case TokenType.KW_JOB:
            ast.jobs.push(this.parseJob());
            break;
          case TokenType.KW_SEED:
            if (ast.seed) {
              this.consume(TokenType.KW_SEED);
              throw this.error(
                "E040_DUPLICATE_SEED_BLOCK",
                "Duplicate seed block found",
                "Only one seed block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.seed = this.parseSeed();
            break;
          case TokenType.KW_ADMIN:
            if (ast.admin) {
              this.consume(TokenType.KW_ADMIN);
              throw this.error(
                "E046_DUPLICATE_ADMIN_BLOCK",
                "Duplicate admin block found",
                "Only one admin block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.admin = this.parseAdmin();
            break;
          case TokenType.KW_STORAGE:
            (ast.storages ??= []).push(this.parseStorage());
            break;
          case TokenType.KW_EMAIL:
            (ast.emails ??= []).push(this.parseEmail());
            break;
          case TokenType.KW_CACHE:
            (ast.caches ??= []).push(this.parseCache());
            break;
          case TokenType.KW_WEBHOOK:
            (ast.webhooks ??= []).push(this.parseWebhook());
            break;
          case TokenType.KW_OBSERVABILITY:
            if (ast.observability) {
              this.consume(TokenType.KW_OBSERVABILITY);
              throw this.error(
                "E090_DUPLICATE_OBSERVABILITY_BLOCK",
                "Duplicate observability block found",
                "Only one observability block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.observability = this.parseObservability();
            break;
          case TokenType.KW_AUTOPAGE:
            (ast.autoPages ??= []).push(this.parseAutoPage());
            break;
          default:
            throw this.error(
              "E010_UNEXPECTED_TOKEN",
              `Unexpected token '${kw.value}' at top level`,
              "Expected a declaration keyword: app, auth, entity, route, page, query, action, api, middleware, crud, realtime, job, seed, admin, storage, email, cache, webhook, observability, or autoPage",
              kw.loc,
            );
        }
      } catch (err) {
        if (err instanceof ParseError) {
          this.diagnostics.push(...err.diagnostics);
          this.skipToNextBlock();
        } else {
          throw err;
        }
      }
    }

    if (this.diagnostics.length > 0) {
      throw new ParseError(this.diagnostics);
    }

    return ast;
  }

  /** Skip tokens until we reach the closing `}` of the current block, then resume at the next top-level keyword. */
  private skipToNextBlock(): void {
    let depth = 0;
    while (!this.isEOF()) {
      const tok = this.peek();
      if (tok.type === TokenType.LBRACE) {
        depth++;
        this.pos++;
      } else if (tok.type === TokenType.RBRACE) {
        if (depth <= 1) {
          this.pos++; // consume the closing brace
          return;
        }
        depth--;
        this.pos++;
      } else if (depth === 0 && BLOCK_KEYWORDS.has(tok.type)) {
        // We've hit the next block keyword at top level — stop skipping
        return;
      } else {
        this.pos++;
      }
    }
  }

  // ---- Block parsers ----

  private parseApp(): AppNode {
    const loc = this.consume(TokenType.KW_APP).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let title = "";
    let db = "Drizzle" as const;
    let ssr: boolean | "ssg" = false;
    let typescript = false;
    const env: Record<string, EnvVarDefinition> = {};
    let multiTenant: MultiTenantConfig | undefined;
    let ui: AppUIConfig | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "title":
          title = this.consumeString();
          if (!title.trim()) {
            throw this.error(
              "E046_EMPTY_APP_TITLE",
              "App title cannot be empty",
              'Provide a non-empty title: title: "MyApp"',
              this.tokens[this.pos - 1]!.loc,
            );
          }
          break;
        case "db":
          db = this.consumeIdentifier().value as "Drizzle";
          break;
        case "ssr": {
          const val = this.peek();
          if (val.type === TokenType.BOOLEAN) {
            ssr = this.consume(TokenType.BOOLEAN).value === "true";
          } else if (val.type === TokenType.STRING) {
            const s = this.consumeString();
            if (s !== "ssg") {
              throw this.error(
                "E011_INVALID_SSR",
                `Invalid ssr value "${s}"`,
                'Use: false, true, or "ssg"',
                val.loc,
              );
            }
            ssr = "ssg";
          } else {
            throw this.error(
              "E011_INVALID_SSR",
              "Invalid ssr value",
              'Use: false, true, or "ssg"',
              val.loc,
            );
          }
          break;
        }
        case "typescript":
          typescript = this.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "env": {
          this.consume(TokenType.LBRACE);
          while (!this.check(TokenType.RBRACE)) {
            const envKey = this.consumeIdentifier().value;
            this.consume(TokenType.COLON);
            const requirementToken = this.consumeIdentifier();
            const requirement = requirementToken.value as EnvRequirement;

            if (requirement !== "required" && requirement !== "optional") {
              throw this.error(
                "E038_INVALID_ENV_REQUIREMENT",
                `Invalid env requirement '${requirement}' for '${envKey}'`,
                "Use required or optional",
                requirementToken.loc,
              );
            }

            if (envKey in env) {
              throw this.error(
                "E039_DUPLICATE_ENV_KEY",
                `Duplicate env key '${envKey}' in app.env`,
                "Each env key must be declared once",
                this.peek().loc,
              );
            }

            // Parse type (String, Int, Boolean, Enum)
            const typeToken = this.consumeIdentifier();
            const envType = typeToken.value as EnvVarType;
            const validEnvTypes = new Set<string>([
              "String",
              "Int",
              "Boolean",
              "Enum",
            ]);
            if (!validEnvTypes.has(envType)) {
              throw this.error(
                "E040_INVALID_ENV_TYPE",
                `Invalid env type '${envType}' for '${envKey}'`,
                "Use String, Int, Boolean, or Enum",
                typeToken.loc,
              );
            }

            let enumValues: string[] | undefined;
            if (envType === "Enum") {
              this.consume(TokenType.LPAREN);
              enumValues = [];
              const seenVariants = new Set<string>();
              while (!this.check(TokenType.RPAREN)) {
                const variant = this.consumeIdentifier();
                if (seenVariants.has(variant.value)) {
                  throw this.error(
                    "E041_DUPLICATE_ENV_ENUM_VARIANT",
                    `Duplicate enum variant '${variant.value}' for env key '${envKey}'`,
                    "Each enum variant must be unique",
                    variant.loc,
                  );
                }
                seenVariants.add(variant.value);
                enumValues.push(variant.value);
                if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
              }
              this.consume(TokenType.RPAREN);
              if (enumValues.length === 0) {
                throw this.error(
                  "E042_EMPTY_ENV_ENUM",
                  `Env var '${envKey}' of type Enum must have at least one variant`,
                  "Example: NODE_ENV: required Enum(development, production)",
                  typeToken.loc,
                );
              }
            }

            // Parse optional modifiers: @default(...), @minLength(...), @maxLength(...),
            // @startsWith(...), @endsWith(...), @min(...), @max(...)
            let defaultValue: string | undefined;
            const validation: EnvVarValidation = {};
            while (this.check(TokenType.AT_MODIFIER)) {
              const mod = this.consume(TokenType.AT_MODIFIER);
              const modVal = mod.value;
              if (modVal.startsWith("default_")) {
                defaultValue = modVal.slice("default_".length);
              } else if (modVal.startsWith("minLength_")) {
                validation.minLength = Number(
                  modVal.slice("minLength_".length),
                );
              } else if (modVal.startsWith("maxLength_")) {
                validation.maxLength = Number(
                  modVal.slice("maxLength_".length),
                );
              } else if (modVal.startsWith("startsWith_")) {
                validation.startsWith = modVal.slice("startsWith_".length);
              } else if (modVal.startsWith("endsWith_")) {
                validation.endsWith = modVal.slice("endsWith_".length);
              } else if (modVal.startsWith("min_")) {
                validation.min = Number(modVal.slice("min_".length));
              } else if (modVal.startsWith("max_")) {
                validation.max = Number(modVal.slice("max_".length));
              }
              // Unknown env modifiers silently ignored (forward-compat)
            }

            const def: EnvVarDefinition = { requirement, type: envType };
            if (enumValues !== undefined) def.enumValues = enumValues;
            if (defaultValue !== undefined) def.defaultValue = defaultValue;
            if (Object.keys(validation).length > 0) def.validation = validation;

            env[envKey] = def;
            if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
          }
          this.consume(TokenType.RBRACE);
          break;
        }
        case "multiTenant": {
          this.consume(TokenType.LBRACE);
          let strategy: MultiTenantStrategy = "row-level";
          let tenantEntity = "";
          let tenantField = "";
          while (!this.check(TokenType.RBRACE)) {
            const mtKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            switch (mtKey.value) {
              case "strategy": {
                const stratVal = this.consumeString();
                strategy = stratVal as MultiTenantStrategy;
                break;
              }
              case "tenantEntity":
                tenantEntity = this.consumeIdentifier().value;
                break;
              case "tenantField":
                tenantField = this.consumeIdentifier().value;
                break;
              default:
                throw this.error(
                  "E047_UNKNOWN_MULTITENANT_PROP",
                  `Unknown multiTenant property '${mtKey.value}'`,
                  "Valid properties: strategy, tenantEntity, tenantField",
                  mtKey.loc,
                );
            }
          }
          this.consume(TokenType.RBRACE);
          multiTenant = { strategy, tenantEntity, tenantField };
          break;
        }
        case "ui": {
          this.consume(TokenType.LBRACE);
          let uiTheme: UITheme = "Aura";
          let uiPrimaryColor: UIPrimaryColor | undefined;
          let uiDarkModeSelector = ".app-dark";
          let uiRipple = true;
          while (!this.check(TokenType.RBRACE)) {
            const uiKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            switch (uiKey.value) {
              case "theme": {
                const themeToken = this.consumeIdentifier();
                if (
                  !(SUPPORTED_UI_THEMES as readonly string[]).includes(
                    themeToken.value,
                  )
                ) {
                  throw this.error(
                    "E048_INVALID_UI_THEME",
                    `Invalid ui.theme '${themeToken.value}'`,
                    `Valid themes: ${SUPPORTED_UI_THEMES.join(", ")}`,
                    themeToken.loc,
                  );
                }
                uiTheme = themeToken.value as UITheme;
                break;
              }
              case "primaryColor": {
                const colorToken = this.consumeIdentifier();
                if (
                  !(SUPPORTED_UI_PRIMARY_COLORS as readonly string[]).includes(
                    colorToken.value,
                  )
                ) {
                  throw this.error(
                    "E049_INVALID_UI_PRIMARY_COLOR",
                    `Invalid ui.primaryColor '${colorToken.value}'`,
                    `Valid colors: ${SUPPORTED_UI_PRIMARY_COLORS.join(", ")}`,
                    colorToken.loc,
                  );
                }
                uiPrimaryColor = colorToken.value as UIPrimaryColor;
                break;
              }
              case "darkModeSelector":
                uiDarkModeSelector = this.consumeString();
                break;
              case "ripple":
                uiRipple = this.consume(TokenType.BOOLEAN).value === "true";
                break;
              default:
                throw this.error(
                  "E050_UNKNOWN_UI_PROP",
                  `Unknown ui property '${uiKey.value}'`,
                  "Valid properties: theme, primaryColor, darkModeSelector, ripple",
                  uiKey.loc,
                );
            }
          }
          this.consume(TokenType.RBRACE);
          ui = {
            theme: uiTheme,
            ...(uiPrimaryColor !== undefined
              ? { primaryColor: uiPrimaryColor }
              : {}),
            darkModeSelector: uiDarkModeSelector,
            ripple: uiRipple,
          };
          break;
        }
        default:
          throw this.error(
            "E012_UNKNOWN_PROP",
            `Unknown app property '${key.value}'`,
            "Valid properties: title, db, ssr, typescript, env, multiTenant, ui",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);
    return {
      type: "App",
      name: name.value,
      loc,
      title,
      db,
      ssr,
      typescript,
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(multiTenant !== undefined ? { multiTenant } : {}),
      ...(ui !== undefined ? { ui } : {}),
    };
  }

  private parseAuth(): AuthNode {
    const loc = this.consume(TokenType.KW_AUTH).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let userEntity = "";
    let methods: AuthMethod[] = [];
    let roles: string[] = [];
    let permissions: PermissionMap | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "userEntity":
          userEntity = this.consumeIdentifier().value;
          break;
        case "methods":
          methods = this.parseIdentifierArray() as AuthMethod[];
          break;
        case "roles":
          roles = this.parseIdentifierArray();
          break;
        case "permissions":
          permissions = this.parseAuthPermissionsMap();
          break;
        default:
          throw this.error(
            "E013_UNKNOWN_PROP",
            `Unknown auth property '${key.value}'`,
            "Valid properties: userEntity, methods, roles, permissions",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);
    return {
      type: "Auth",
      name: name.value,
      loc,
      userEntity,
      methods,
      ...(roles.length > 0 ? { roles } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    };
  }

  private parseEntity(): EntityNode {
    const loc = this.consume(TokenType.KW_ENTITY).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    // Primitive types recognized by the parser — entity names accepted for relations
    const primitiveTypes = new Set([
      "String",
      "Int",
      "Boolean",
      "DateTime",
      "Float",
      "Text",
      "Json",
      "Enum",
      "File",
    ]);

    const fields: FieldNode[] = [];
    const indexes: EntityIndex[] = [];
    const uniqueConstraints: EntityUniqueConstraint[] = [];

    while (!this.check(TokenType.RBRACE)) {
      // Table-level directives: @@index([fields]), @@index([fields], type: fulltext), @@unique([fields])
      if (this.check(TokenType.AT_AT_DIRECTIVE)) {
        const directive = this.consume(TokenType.AT_AT_DIRECTIVE);
        if (directive.value === "index") {
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.LBRACKET);
          const indexFields: string[] = [];
          while (!this.check(TokenType.RBRACKET)) {
            indexFields.push(this.consumeIdentifier().value);
            if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
          }
          this.consume(TokenType.RBRACKET);
          if (indexFields.length === 0) {
            throw this.error(
              "E165_EMPTY_INDEX_FIELDS",
              `@@index on entity '${name.value}' must specify at least one field`,
              "Example: @@index([field1, field2])",
              directive.loc,
            );
          }
          let indexType: EntityIndexType | undefined;
          if (this.check(TokenType.COMMA)) {
            this.consume(TokenType.COMMA);
            const typeKey = this.consumeIdentifier();
            if (typeKey.value !== "type") {
              throw this.error(
                "E166_UNKNOWN_INDEX_OPTION",
                `Unknown @@index option '${typeKey.value}'`,
                "Valid options: type",
                typeKey.loc,
              );
            }
            this.consume(TokenType.COLON);
            const typeVal = this.consumeIdentifier();
            if (typeVal.value === "fulltext") {
              indexType = "fulltext";
            } else {
              throw this.error(
                "E167_UNKNOWN_INDEX_TYPE",
                `Unknown @@index type '${typeVal.value}'`,
                "Valid types: fulltext",
                typeVal.loc,
              );
            }
          }
          this.consume(TokenType.RPAREN);
          indexes.push({
            fields: indexFields,
            ...(indexType ? { type: indexType } : {}),
          });
          continue;
        } else if (directive.value === "unique") {
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.LBRACKET);
          const uniqueFields: string[] = [];
          while (!this.check(TokenType.RBRACKET)) {
            uniqueFields.push(this.consumeIdentifier().value);
            if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
          }
          this.consume(TokenType.RBRACKET);
          if (uniqueFields.length === 0) {
            throw this.error(
              "E168_EMPTY_UNIQUE_FIELDS",
              `@@unique on entity '${name.value}' must specify at least one field`,
              "Example: @@unique([field1, field2])",
              directive.loc,
            );
          }
          this.consume(TokenType.RPAREN);
          uniqueConstraints.push({ fields: uniqueFields });
          continue;
        } else {
          throw this.error(
            "E169_UNKNOWN_TABLE_DIRECTIVE",
            `Unknown table directive '@@${directive.value}'`,
            "Valid table directives: @@index, @@unique",
            directive.loc,
          );
        }
      }

      const fieldName = this.consumeIdentifier();
      this.consume(TokenType.COLON);
      const fieldTypeToken = this.consumeIdentifier();
      const fieldTypeStr = fieldTypeToken.value;

      // Parse Enum variant list: Enum(active, inactive, archived)
      let enumValues: string[] | undefined;
      if (fieldTypeStr === "Enum") {
        this.consume(TokenType.LPAREN);
        enumValues = [];
        const seenVariants = new Set<string>();
        while (!this.check(TokenType.RPAREN)) {
          const variant = this.consumeIdentifier();
          if (seenVariants.has(variant.value)) {
            throw this.error(
              "E150_DUPLICATE_ENUM_VARIANT",
              `Duplicate enum variant '${variant.value}' in field '${fieldName.value}'`,
              "Each enum variant must be unique",
              variant.loc,
            );
          }
          seenVariants.add(variant.value);
          enumValues.push(variant.value);
          if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
        }
        this.consume(TokenType.RPAREN);
        if (enumValues.length === 0) {
          throw this.error(
            "E141_EMPTY_ENUM",
            `Enum field '${fieldName.value}' must have at least one variant`,
            "Example: status: Enum(active, inactive, archived)",
            fieldTypeToken.loc,
          );
        }
      }

      // Detect [] suffix — marks this as an array relation (virtual, no column)
      let isArray = false;
      if (this.check(TokenType.LBRACKET)) {
        this.consume(TokenType.LBRACKET);
        this.consume(TokenType.RBRACKET);
        isArray = true;
      }

      const isRelation = !primitiveTypes.has(fieldTypeStr);

      // Parse modifiers (@id, @unique, @default(...), @nullable, @updatedAt, @onDelete(...), @validate(...), @manyToMany, @storage(...))
      const modifiers: FieldModifier[] = [];
      let nullable = false;
      let defaultValue: string | undefined;
      let onDelete: OnDeleteBehavior | undefined;
      let isUpdatedAt = false;
      let fieldValidation: FieldValidation | undefined;
      let isManyToMany = false;
      let storageBlock: string | undefined;

      while (this.check(TokenType.AT_MODIFIER)) {
        const mod = this.consume(TokenType.AT_MODIFIER);
        const modVal = mod.value;

        if (modVal === "id") {
          modifiers.push("id");
        } else if (modVal === "unique") {
          modifiers.push("unique");
        } else if (modVal === "default_now") {
          modifiers.push("default_now");
          defaultValue = "now";
        } else if (modVal === "nullable") {
          nullable = true;
          modifiers.push("nullable");
        } else if (modVal === "updatedAt") {
          isUpdatedAt = true;
          modifiers.push("updatedAt");
        } else if (modVal === "manyToMany") {
          isManyToMany = true;
        } else if (modVal.startsWith("default_")) {
          defaultValue = modVal.slice("default_".length);
        } else if (modVal.startsWith("onDelete_")) {
          const raw = modVal.slice("onDelete_".length);
          onDelete = (raw === "setNull" ? "set null" : raw) as OnDeleteBehavior;
        } else if (modVal.startsWith("validate_")) {
          fieldValidation = parseValidateArgs(modVal.slice("validate_".length));
        } else if (modVal.startsWith("storage_")) {
          storageBlock = modVal.slice("storage_".length);
        }
        // Unknown modifiers are silently ignored (forward-compat)
      }

      const field: FieldNode = {
        name: fieldName.value,
        type: fieldTypeStr,
        modifiers,
        isRelation,
        isArray,
        nullable,
        isUpdatedAt,
      };
      if (isRelation) field.relatedEntity = fieldTypeStr;
      if (defaultValue !== undefined) field.defaultValue = defaultValue;
      if (onDelete !== undefined) field.onDelete = onDelete;
      if (enumValues !== undefined) field.enumValues = enumValues;
      if (fieldValidation !== undefined) field.validation = fieldValidation;
      if (isManyToMany) field.isManyToMany = true;
      if (storageBlock !== undefined) field.storageBlock = storageBlock;

      fields.push(field);
    }

    this.consume(TokenType.RBRACE);
    return {
      type: "Entity",
      name: name.value,
      loc,
      fields,
      ...(indexes.length > 0 ? { indexes } : {}),
      ...(uniqueConstraints.length > 0 ? { uniqueConstraints } : {}),
    };
  }

  private parseRoute(): RouteNode {
    const loc = this.consume(TokenType.KW_ROUTE).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let path = "";
    let to = "";
    let routeProtected: boolean | undefined = undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "path":
          path = this.consumeString();
          break;
        case "to":
          to = this.consumeIdentifier().value;
          break;
        case "protected":
          routeProtected = this.consume(TokenType.BOOLEAN).value === "true";
          break;
        default:
          throw this.error(
            "E014_UNKNOWN_PROP",
            `Unknown route property '${key.value}'`,
            "Valid properties: path, to, protected",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);
    const params = extractRouteParams(path);
    const node: RouteNode = { type: "Route", name: name.value, loc, path, to, params };
    if (routeProtected !== undefined) node.protected = routeProtected;
    return node;
  }

  private parsePage(): PageNode {
    const loc = this.consume(TokenType.KW_PAGE).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let component: ImportExpression | null = null;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "component":
          component = this.parseImportExpression();
          break;
        default:
          throw this.error(
            "E015_UNKNOWN_PROP",
            `Unknown page property '${key.value}'`,
            "Valid properties: component",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!component) {
      throw this.error(
        "E016_MISSING_COMPONENT",
        `Page '${name.value}' is missing a component`,
        'Add: component: import Foo from "@src/pages/Foo.vue"',
        loc,
      );
    }

    return { type: "Page", name: name.value, loc, component };
  }

  private parseQuery(): QueryNode {
    const loc = this.consume(TokenType.KW_QUERY).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let fn: ImportExpression | null = null;
    let entities: string[] = [];
    let auth = false;
    let roles: string[] = [];
    let cache: QueryCacheConfig | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "fn":
          fn = this.parseImportExpression();
          break;
        case "entities":
          entities = this.parseIdentifierArray();
          break;
        case "auth":
          auth = this.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "roles":
          roles = this.parseIdentifierArray();
          break;
        case "cache":
          cache = this.parseQueryCacheConfig(key.loc);
          break;
        default:
          throw this.error(
            "E017_UNKNOWN_PROP",
            `Unknown query property '${key.value}'`,
            "Valid properties: fn, entities, auth, roles, cache",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!fn) {
      throw this.error(
        "E018_MISSING_FN",
        `Query '${name.value}' is missing fn`,
        'Add: fn: import { myFn } from "@src/queries.js"',
        loc,
      );
    }

    return {
      type: "Query",
      name: name.value,
      loc,
      fn,
      entities,
      auth,
      ...(roles.length > 0 ? { roles } : {}),
      ...(cache !== undefined ? { cache } : {}),
    };
  }

  private parseAction(): ActionNode {
    const loc = this.consume(TokenType.KW_ACTION).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let fn: ImportExpression | null = null;
    let entities: string[] = [];
    let auth = false;
    let roles: string[] = [];
    let onSuccess: ActionOnSuccess | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "fn":
          fn = this.parseImportExpression();
          break;
        case "entities":
          entities = this.parseIdentifierArray();
          break;
        case "auth":
          auth = this.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "roles":
          roles = this.parseIdentifierArray();
          break;
        case "onSuccess": {
          this.consume(TokenType.LBRACE);
          const successConfig: ActionOnSuccess = {};
          while (!this.check(TokenType.RBRACE)) {
            const innerKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            if (innerKey.value === "sendEmail") {
              successConfig.sendEmail = this.consumeIdentifier().value;
            } else {
              throw this.error(
                "E057_UNKNOWN_PROP",
                `Unknown onSuccess property '${innerKey.value}'`,
                "Valid properties: sendEmail",
                innerKey.loc,
              );
            }
          }
          this.consume(TokenType.RBRACE);
          onSuccess = successConfig;
          break;
        }
        default:
          throw this.error(
            "E019_UNKNOWN_PROP",
            `Unknown action property '${key.value}'`,
            "Valid properties: fn, entities, auth, roles, onSuccess",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!fn) {
      throw this.error(
        "E020_MISSING_FN",
        `Action '${name.value}' is missing fn`,
        'Add: fn: import { myFn } from "@src/actions.js"',
        loc,
      );
    }

    return {
      type: "Action",
      name: name.value,
      loc,
      fn,
      entities,
      auth,
      ...(roles.length > 0 ? { roles } : {}),
      ...(onSuccess !== undefined ? { onSuccess } : {}),
    };
  }

  private parseCrud(): CrudNode {
    const loc = this.consume(TokenType.KW_CRUD).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let entity = "";
    let operations: CrudOperation[] = [];
    let listConfig: CrudListConfig | undefined;
    let permissions: CrudPermissions | undefined;
    let ownership: string | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "entity":
          entity = this.consumeIdentifier().value;
          break;
        case "operations":
          operations = this.parseIdentifierArray() as CrudOperation[];
          break;
        case "list":
          listConfig = this.parseCrudListConfig();
          break;
        case "permissions":
          permissions = this.parseCrudPermissionsMap();
          break;
        case "ownership":
          ownership = this.consumeIdentifier().value;
          break;
        default:
          throw this.error(
            "E021_UNKNOWN_PROP",
            `Unknown crud property '${key.value}'`,
            "Valid properties: entity, operations, list, permissions, ownership",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);
    return {
      type: "Crud",
      name: name.value,
      loc,
      entity,
      operations,
      ...(listConfig !== undefined ? { listConfig } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
      ...(ownership !== undefined ? { ownership } : {}),
    };
  }

  private parseCrudListConfig(): CrudListConfig {
    this.consume(TokenType.LBRACE);

    let paginate = false;
    let sortable: string[] = [];
    let filterable: string[] = [];
    let search: string[] = [];

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "paginate":
          paginate = this.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "sortable":
          sortable = this.parseIdentifierArray();
          break;
        case "filterable":
          filterable = this.parseIdentifierArray();
          break;
        case "search":
          search = this.parseIdentifierArray();
          break;
        default:
          throw this.error(
            "E021_UNKNOWN_PROP",
            `Unknown list property '${key.value}'`,
            "Valid properties: paginate, sortable, filterable, search",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);
    return { paginate, sortable, filterable, search };
  }

  /**
   * Parses a permission name that may be a simple identifier ("read") or a
   * namespaced identifier ("task:read"). Uses one token of lookahead so that
   * the `COLON` inside `task:read` is not confused with a key-value separator.
   *
   * Lookahead pattern detected as namespace: COLON followed immediately by
   * another IDENTIFIER token (the name segment).
   */
  private parsePermissionName(): string {
    const first = this.consumeIdentifier().value;
    // Peek ahead: if the next token is COLON and the token after is an
    // IDENTIFIER, this is a namespaced permission name (e.g. "task:read").
    if (
      this.check(TokenType.COLON) &&
      this.tokens[this.pos + 1]?.type === TokenType.IDENTIFIER
    ) {
      this.consume(TokenType.COLON);
      const second = this.consumeIdentifier().value;
      return `${first}:${second}`;
    }
    return first;
  }

  /**
   * Parses the auth `permissions` block:
   *   { task:create: [admin, manager] task:read: [admin, viewer] }
   *
   * Keys may be namespaced (task:create) or simple (read).
   * Values are arrays of role identifiers.
   */
  private parseAuthPermissionsMap(): PermissionMap {
    this.consume(TokenType.LBRACE);
    const result: PermissionMap = {};

    while (!this.check(TokenType.RBRACE)) {
      // Parse key — may be "ns:name" or a simple name.
      // After consuming the first identifier, check whether the next COLON is
      // a namespace separator or the key-value separator:
      //   ns:name:  → IDENTIFIER COLON IDENTIFIER COLON [...]
      //   simple:   → IDENTIFIER COLON [...]
      const first = this.consumeIdentifier().value;
      let key = first;
      if (
        this.check(TokenType.COLON) &&
        this.tokens[this.pos + 1]?.type === TokenType.IDENTIFIER &&
        this.tokens[this.pos + 2]?.type === TokenType.COLON
      ) {
        // Namespace separator — consume the COLON and the name segment.
        this.consume(TokenType.COLON);
        const second = this.consumeIdentifier().value;
        key = `${first}:${second}`;
      }
      // Consume the key-value separator.
      this.consume(TokenType.COLON);
      const roles = this.parseIdentifierArray();
      result[key] = roles;
    }

    this.consume(TokenType.RBRACE);
    return result;
  }

  /**
   * Parses the crud `permissions` block:
   *   { list: task:read  create: task:create  delete: task:delete }
   *
   * Keys are simple operation names; values are permission names (may be
   * namespaced, e.g. "task:read").
   */
  private parseCrudPermissionsMap(): CrudPermissions {
    this.consume(TokenType.LBRACE);
    const result: CrudPermissions = {};

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier().value;
      this.consume(TokenType.COLON);
      const permissionName = this.parsePermissionName();
      result[key] = permissionName;
      if (this.check(TokenType.COMMA)) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(TokenType.RBRACE);
    return result;
  }

  private parseApi(): ApiNode {
    const loc = this.consume(TokenType.KW_API).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let method = "GET" as ApiMethod;
    let path = "";
    let fn: ImportExpression | null = null;
    let auth = false;
    let roles: string[] = [];

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "method":
          method = this.consumeIdentifier().value.toUpperCase() as ApiMethod;
          break;
        case "path":
          path = this.consumeString();
          break;
        case "fn":
          fn = this.parseImportExpression();
          break;
        case "auth":
          auth = this.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "roles":
          roles = this.parseIdentifierArray();
          break;
        default:
          throw this.error(
            "E033_UNKNOWN_PROP",
            `Unknown api property '${key.value}'`,
            "Valid properties: method, path, fn, auth, roles",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!fn) {
      throw this.error(
        "E034_MISSING_FN",
        `Api '${name.value}' is missing fn`,
        'Add: fn: import { myHandler } from "@src/api.js"',
        loc,
      );
    }

    if (!path) {
      throw this.error(
        "E035_MISSING_PATH",
        `Api '${name.value}' is missing path`,
        'Add: path: "/api/my-endpoint"',
        loc,
      );
    }

    if (!path.startsWith("/")) {
      throw this.error(
        "E047_INVALID_API_PATH",
        `Api '${name.value}' path must start with '/'`,
        'Example: path: "/api/my-endpoint"',
        loc,
      );
    }

    return {
      type: "Api",
      name: name.value,
      loc,
      method,
      path,
      fn,
      auth,
      ...(roles.length > 0 ? { roles } : {}),
    };
  }

  private parseMiddleware(): MiddlewareNode {
    const loc = this.consume(TokenType.KW_MIDDLEWARE).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let fn: ImportExpression | null = null;
    let scope = "global" as MiddlewareScope;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "fn":
          fn = this.parseImportExpression();
          break;
        case "scope":
          scope = this.consumeIdentifier().value as MiddlewareScope;
          break;
        default:
          throw this.error(
            "E036_UNKNOWN_PROP",
            `Unknown middleware property '${key.value}'`,
            "Valid properties: fn, scope",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!fn) {
      throw this.error(
        "E037_MISSING_FN",
        `Middleware '${name.value}' is missing fn`,
        'Add: fn: import logger from "@src/middleware/logger.js"',
        loc,
      );
    }

    return { type: "Middleware", name: name.value, loc, fn, scope };
  }

  private parseRealtime(): RealtimeNode {
    const loc = this.consume(TokenType.KW_REALTIME).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let entity = "";
    let events: RealtimeEvent[] = [];

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "entity":
          entity = this.consumeIdentifier().value;
          break;
        case "events":
          events = this.parseIdentifierArray() as RealtimeEvent[];
          break;
        default:
          throw this.error(
            "E022_UNKNOWN_PROP",
            `Unknown realtime property '${key.value}'`,
            "Valid properties: entity, events",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);
    return { type: "Realtime", name: name.value, loc, entity, events };
  }

  private parseJob(): JobNode {
    const loc = this.consume(TokenType.KW_JOB).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let executor = "PgBoss" as JobNode["executor"];
    let performFn: ImportExpression | null = null;
    let schedule: string | undefined;
    let priority: number | undefined;
    let retries: JobRetryConfig | undefined;
    let deadLetter: JobDeadLetterConfig | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "executor":
          executor = this.consumeIdentifier().value as JobNode["executor"];
          break;
        case "priority": {
          const tok = this.consume(TokenType.NUMBER);
          priority = Number(tok.value);
          break;
        }
        case "retries": {
          // Nested block: retries: { limit: N, backoff: exponential, delay: N, multiplier: N }
          this.consume(TokenType.LBRACE);
          const retriesCfg: JobRetryConfig = {};
          while (!this.check(TokenType.RBRACE)) {
            const innerKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            switch (innerKey.value) {
              case "limit": {
                const tok = this.consume(TokenType.NUMBER);
                retriesCfg.limit = Number(tok.value);
                break;
              }
              case "backoff": {
                const backoffTok = this.consumeIdentifier();
                if (
                  !(
                    SUPPORTED_JOB_BACKOFF_STRATEGIES as readonly string[]
                  ).includes(backoffTok.value)
                ) {
                  throw this.error(
                    "E026_UNKNOWN_BACKOFF",
                    `Unknown backoff strategy '${backoffTok.value}'`,
                    `Valid strategies: ${SUPPORTED_JOB_BACKOFF_STRATEGIES.join(", ")}`,
                    backoffTok.loc,
                  );
                }
                retriesCfg.backoff = backoffTok.value as JobBackoffStrategy;
                break;
              }
              case "delay": {
                const tok = this.consume(TokenType.NUMBER);
                retriesCfg.delay = Number(tok.value);
                break;
              }
              case "multiplier": {
                const tok = this.consume(TokenType.NUMBER);
                retriesCfg.multiplier = Number(tok.value);
                break;
              }
              default:
                throw this.error(
                  "E027_UNKNOWN_PROP",
                  `Unknown retries property '${innerKey.value}'`,
                  "Valid properties: limit, backoff, delay, multiplier",
                  innerKey.loc,
                );
            }
          }
          this.consume(TokenType.RBRACE);
          retries = retriesCfg;
          break;
        }
        case "deadLetter": {
          // Nested block: deadLetter: { queue: "name" }
          this.consume(TokenType.LBRACE);
          const dlqCfg: JobDeadLetterConfig = {};
          while (!this.check(TokenType.RBRACE)) {
            const innerKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            if (innerKey.value === "queue") {
              dlqCfg.queue = this.consumeString();
            } else {
              throw this.error(
                "E028_UNKNOWN_PROP",
                `Unknown deadLetter property '${innerKey.value}'`,
                "Valid properties: queue",
                innerKey.loc,
              );
            }
          }
          this.consume(TokenType.RBRACE);
          deadLetter = dlqCfg;
          break;
        }
        case "perform": {
          // Nested block: perform: { fn: import ... }
          this.consume(TokenType.LBRACE);
          while (!this.check(TokenType.RBRACE)) {
            const innerKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            if (innerKey.value === "fn") {
              performFn = this.parseImportExpression();
            } else {
              throw this.error(
                "E023_UNKNOWN_PROP",
                `Unknown perform property '${innerKey.value}'`,
                "Valid properties: fn",
                innerKey.loc,
              );
            }
          }
          this.consume(TokenType.RBRACE);
          break;
        }
        case "schedule":
          schedule = this.consumeString();
          break;
        default:
          throw this.error(
            "E024_UNKNOWN_PROP",
            `Unknown job property '${key.value}'`,
            "Valid properties: executor, priority, retries, deadLetter, perform, schedule",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!performFn) {
      throw this.error(
        "E025_MISSING_PERFORM",
        `Job '${name.value}' is missing perform.fn`,
        'Add: perform: { fn: import { myJob } from "@src/jobs.js" }',
        loc,
      );
    }

    return {
      type: "Job",
      name: name.value,
      loc,
      executor,
      perform: { fn: performFn },
      ...(schedule !== undefined ? { schedule } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(retries !== undefined ? { retries } : {}),
      ...(deadLetter !== undefined ? { deadLetter } : {}),
    };
  }

  private parseSeed(): SeedNode {
    const loc = this.consume(TokenType.KW_SEED).loc;
    this.consume(TokenType.LBRACE);

    let fn: ImportExpression | null = null;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "fn":
          fn = this.parseImportExpression();
          break;
        default:
          throw this.error(
            "E041_UNKNOWN_PROP",
            `Unknown seed property '${key.value}'`,
            "Valid properties: fn",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!fn) {
      throw this.error(
        "E042_MISSING_FN",
        "Seed block is missing fn",
        'Add: fn: import seedData from "@src/seed.js"',
        loc,
      );
    }

    return { type: "Seed", fn, loc };
  }

  private parseAdmin(): AdminNode {
    const loc = this.consume(TokenType.KW_ADMIN).loc;
    this.consume(TokenType.LBRACE);

    let entities: string[] = [];

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "entities":
          entities = this.parseIdentifierArray();
          break;
        default:
          throw this.error(
            "E047_UNKNOWN_PROP",
            `Unknown admin property '${key.value}'`,
            "Valid properties: entities",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    return { type: "Admin", entities, loc };
  }

  private parseStorage(): StorageNode {
    const loc = this.consume(TokenType.KW_STORAGE).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let provider: StorageProvider | null = null;
    let bucket: string | undefined;
    let maxSize: string | undefined;
    let allowedTypes: string[] | undefined;
    let publicPath: string | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "provider":
          provider = this.consumeIdentifier().value as StorageProvider;
          break;
        case "bucket":
          bucket = this.consumeString();
          break;
        case "maxSize":
          maxSize = this.consumeString();
          break;
        case "allowedTypes":
          allowedTypes = this.parseStringArray();
          break;
        case "publicPath":
          publicPath = this.consumeString();
          break;
        default:
          throw this.error(
            "E055_UNKNOWN_PROP",
            `Unknown storage property '${key.value}'`,
            "Valid properties: provider, bucket, maxSize, allowedTypes, publicPath",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!provider) {
      throw this.error(
        "E056_MISSING_STORAGE_PROVIDER",
        `Storage block '${name.value}' is missing a provider`,
        "Add: provider: local (or s3, r2, gcs)",
        loc,
      );
    }

    return {
      type: "Storage",
      name: name.value,
      loc,
      provider,
      ...(bucket !== undefined ? { bucket } : {}),
      ...(maxSize !== undefined ? { maxSize } : {}),
      ...(allowedTypes !== undefined ? { allowedTypes } : {}),
      ...(publicPath !== undefined ? { publicPath } : {}),
    };
  }

  private parseEmail(): EmailNode {
    const loc = this.consume(TokenType.KW_EMAIL).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let provider: EmailProvider | null = null;
    let from = "";
    const templates: EmailTemplateEntry[] = [];

    while (!this.check(TokenType.RBRACE)) {
      // `from` is a reserved keyword (KW_FROM) in the lexer, so we must handle
      // it specially as a property key inside the email block.
      let key: Token;
      if (this.peek().type === TokenType.KW_FROM) {
        key = this.consume(TokenType.KW_FROM);
      } else {
        key = this.consumeIdentifier();
      }
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "provider":
          provider = this.consumeIdentifier().value as EmailProvider;
          break;
        case "from":
          from = this.consumeString();
          break;
        case "templates": {
          this.consume(TokenType.LBRACE);
          while (!this.check(TokenType.RBRACE)) {
            const templateName = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            const fn = this.parseImportExpression();
            templates.push({ name: templateName.value, fn });
            if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
          }
          this.consume(TokenType.RBRACE);
          break;
        }
        default:
          throw this.error(
            "E058_UNKNOWN_PROP",
            `Unknown email property '${key.value}'`,
            "Valid properties: provider, from, templates",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!provider) {
      throw this.error(
        "E059_MISSING_EMAIL_PROVIDER",
        `Email block '${name.value}' is missing a provider`,
        "Add: provider: resend (or sendgrid, smtp)",
        loc,
      );
    }

    if (!from) {
      throw this.error(
        "E060_MISSING_EMAIL_FROM",
        `Email block '${name.value}' is missing from address`,
        'Add: from: "noreply@myapp.com"',
        loc,
      );
    }

    return {
      type: "Email",
      name: name.value,
      loc,
      provider,
      from,
      templates,
    };
  }

  private parseCache(): CacheNode {
    const loc = this.consume(TokenType.KW_CACHE).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let provider: CacheProvider | null = null;
    let ttl: number | undefined;
    let redis: CacheRedisConfig | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "provider":
          provider = this.consumeIdentifier().value as CacheProvider;
          break;
        case "ttl": {
          const tok = this.consume(TokenType.NUMBER);
          ttl = Number(tok.value);
          break;
        }
        case "redis": {
          this.consume(TokenType.LBRACE);
          let redisUrl: string | null = null;
          while (!this.check(TokenType.RBRACE)) {
            const innerKey = this.consumeIdentifier();
            this.consume(TokenType.COLON);
            if (innerKey.value === "url") {
              redisUrl = this.parseEnvRef();
            } else {
              throw this.error(
                "E072_UNKNOWN_PROP",
                `Unknown redis property '${innerKey.value}'`,
                "Valid properties: url",
                innerKey.loc,
              );
            }
          }
          this.consume(TokenType.RBRACE);
          if (!redisUrl) {
            throw this.error(
              "E073_MISSING_REDIS_URL",
              `cache '${name.value}' redis block is missing url`,
              "Add: url: env(REDIS_URL)",
              key.loc,
            );
          }
          redis = { url: redisUrl };
          break;
        }
        default:
          throw this.error(
            "E071_UNKNOWN_PROP",
            `Unknown cache property '${key.value}'`,
            "Valid properties: provider, ttl, redis",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!provider) {
      throw this.error(
        "E070_MISSING_CACHE_PROVIDER",
        `Cache block '${name.value}' is missing a provider`,
        "Add: provider: memory (or redis, valkey)",
        loc,
      );
    }

    return {
      type: "Cache",
      name: name.value,
      loc,
      provider,
      ...(ttl !== undefined ? { ttl } : {}),
      ...(redis !== undefined ? { redis } : {}),
    };
  }

  private parseWebhook(): WebhookNode {
    const loc = this.consume(TokenType.KW_WEBHOOK).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let secret: string | undefined;
    // Inbound
    let path: string | undefined;
    let fn: ImportExpression | undefined;
    let verifyWith: WebhookVerification | undefined;
    // Outbound
    let entity: string | undefined;
    let events: string[] | undefined;
    let targets: string | undefined;
    let retry: number | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "secret":
          secret = this.parseEnvRef();
          break;
        case "path":
          path = this.consumeString();
          break;
        case "fn":
          fn = this.parseImportExpression();
          break;
        case "verifyWith":
          verifyWith = this.consumeString() as WebhookVerification;
          break;
        case "entity":
          entity = this.consumeIdentifier().value;
          break;
        case "events":
          events = this.parseIdentifierArray();
          break;
        case "targets":
          targets = this.parseEnvRef();
          break;
        case "retry": {
          const tok = this.consume(TokenType.NUMBER);
          retry = Number(tok.value);
          break;
        }
        default:
          throw this.error(
            "E080_UNKNOWN_WEBHOOK_PROP",
            `Unknown webhook property '${key.value}'`,
            "Valid properties: secret, path, fn, verifyWith, entity, events, targets, retry",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    // Determine mode: inbound has `fn`, outbound has `entity`
    const isInbound = fn !== undefined;
    const isOutbound = entity !== undefined;

    if (!isInbound && !isOutbound) {
      throw this.error(
        "E081_MISSING_WEBHOOK_MODE",
        `Webhook block '${name.value}' must define either 'fn' (inbound) or 'entity' (outbound)`,
        'Add: fn: import { handler } from "@src/..." for inbound, or entity: EntityName for outbound',
        loc,
      );
    }

    if (isInbound && isOutbound) {
      throw this.error(
        "E082_AMBIGUOUS_WEBHOOK_MODE",
        `Webhook block '${name.value}' cannot define both 'fn' (inbound) and 'entity' (outbound)`,
        "Use either fn or entity, not both",
        loc,
      );
    }

    const mode: WebhookMode = isInbound ? "inbound" : "outbound";

    if (mode === "inbound" && !path) {
      throw this.error(
        "E083_INBOUND_WEBHOOK_MISSING_PATH",
        `Inbound webhook '${name.value}' is missing a path`,
        'Add: path: "/webhooks/my-webhook"',
        loc,
      );
    }

    if (mode === "outbound" && (!events || events.length === 0)) {
      throw this.error(
        "E084_OUTBOUND_WEBHOOK_MISSING_EVENTS",
        `Outbound webhook '${name.value}' is missing events`,
        "Add: events: [created, updated, deleted]",
        loc,
      );
    }

    if (mode === "outbound" && !targets) {
      throw this.error(
        "E085_OUTBOUND_WEBHOOK_MISSING_TARGETS",
        `Outbound webhook '${name.value}' is missing targets`,
        "Add: targets: env(WEBHOOK_URLS)",
        loc,
      );
    }

    return {
      type: "Webhook",
      name: name.value,
      loc,
      mode,
      ...(secret !== undefined ? { secret } : {}),
      ...(path !== undefined ? { path } : {}),
      ...(fn !== undefined ? { fn } : {}),
      ...(verifyWith !== undefined ? { verifyWith } : {}),
      ...(entity !== undefined ? { entity } : {}),
      ...(events !== undefined ? { events } : {}),
      ...(targets !== undefined ? { targets } : {}),
      ...(retry !== undefined ? { retry } : {}),
    };
  }

  private parseObservability(): ObservabilityNode {
    const loc = this.consume(TokenType.KW_OBSERVABILITY).loc;
    this.consume(TokenType.LBRACE);

    let tracing = false;
    let metrics = false;
    let logs: ObservabilityLogsMode = "console";
    let exporter: ObservabilityExporter = "console";
    let errorTracking: ErrorTrackingProvider = "none";

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "tracing": {
          const tok = this.consume(TokenType.BOOLEAN);
          tracing = tok.value === "true";
          break;
        }
        case "metrics": {
          const tok = this.consume(TokenType.BOOLEAN);
          metrics = tok.value === "true";
          break;
        }
        case "logs": {
          const tok = this.consumeIdentifier();
          if (
            !(SUPPORTED_OBSERVABILITY_LOGS_MODES as readonly string[]).includes(
              tok.value,
            )
          ) {
            throw this.error(
              "E091_INVALID_OBSERVABILITY_LOGS_MODE",
              `Invalid observability logs mode '${tok.value}'`,
              `Valid values: ${SUPPORTED_OBSERVABILITY_LOGS_MODES.join(", ")}`,
              tok.loc,
            );
          }
          logs = tok.value as ObservabilityLogsMode;
          break;
        }
        case "exporter": {
          const tok = this.consumeIdentifier();
          if (
            !(SUPPORTED_OBSERVABILITY_EXPORTERS as readonly string[]).includes(
              tok.value,
            )
          ) {
            throw this.error(
              "E092_INVALID_OBSERVABILITY_EXPORTER",
              `Invalid observability exporter '${tok.value}'`,
              `Valid values: ${SUPPORTED_OBSERVABILITY_EXPORTERS.join(", ")}`,
              tok.loc,
            );
          }
          exporter = tok.value as ObservabilityExporter;
          break;
        }
        case "errorTracking": {
          const tok = this.consumeIdentifier();
          if (
            !(
              SUPPORTED_ERROR_TRACKING_PROVIDERS as readonly string[]
            ).includes(tok.value)
          ) {
            throw this.error(
              "E093_INVALID_ERROR_TRACKING_PROVIDER",
              `Invalid errorTracking value '${tok.value}'`,
              `Valid values: ${SUPPORTED_ERROR_TRACKING_PROVIDERS.join(", ")}`,
              tok.loc,
            );
          }
          errorTracking = tok.value as ErrorTrackingProvider;
          break;
        }
        default:
          throw this.error(
            "E094_UNKNOWN_OBSERVABILITY_PROP",
            `Unknown observability property '${key.value}'`,
            "Valid properties: tracing, metrics, logs, exporter, errorTracking",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    return { type: "Observability", tracing, metrics, logs, exporter, errorTracking, loc };
  }

  private parseAutoPage(): AutoPageNode {
    const loc = this.consume(TokenType.KW_AUTOPAGE).loc;
    const name = this.consumeIdentifier();
    this.consume(TokenType.LBRACE);

    let entity = "";
    let path = "";
    let pageType: AutoPageType | null = null;
    let title: string | undefined;
    let columns: string[] | undefined;
    let sortable: string[] | undefined;
    let filterable: string[] | undefined;
    let searchable: string[] | undefined;
    let paginate: boolean | undefined;
    let pageSize: number | undefined;
    let rowActions: AutoPageRowAction[] | undefined;
    let topActions: AutoPageTopAction[] | undefined;
    let fields: string[] | undefined;
    let layout: AutoPageLayout | undefined;
    let submitAction: string | undefined;
    let successRoute: string | undefined;
    let auth: boolean | undefined;
    let roles: string[] | undefined;

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const key = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (key.value) {
        case "entity":
          entity = this.consumeIdentifier().value;
          break;
        case "path":
          path = this.consumeString();
          break;
        case "type": {
          const typeTok = this.consumeIdentifier();
          if (
            !(SUPPORTED_AUTOPAGE_TYPES as readonly string[]).includes(
              typeTok.value,
            )
          ) {
            throw this.error(
              "E_AUTOPAGE_INVALID_TYPE",
              `Invalid autoPage type '${typeTok.value}'`,
              `Valid values: ${SUPPORTED_AUTOPAGE_TYPES.join(", ")}`,
              typeTok.loc,
            );
          }
          pageType = typeTok.value as AutoPageType;
          break;
        }
        case "title":
          title = this.consumeString();
          break;
        case "columns":
          columns = this.parseIdentifierArray();
          break;
        case "sortable":
          sortable = this.parseIdentifierArray();
          break;
        case "filterable":
          filterable = this.parseIdentifierArray();
          break;
        case "searchable":
          searchable = this.parseIdentifierArray();
          break;
        case "paginate": {
          const bt = this.consume(TokenType.BOOLEAN);
          paginate = bt.value === "true";
          break;
        }
        case "pageSize": {
          const numTok = this.consume(TokenType.NUMBER);
          pageSize = Number(numTok.value);
          break;
        }
        case "rowActions":
          rowActions = this.parseIdentifierArray() as AutoPageRowAction[];
          break;
        case "topActions":
          topActions = this.parseIdentifierArray() as AutoPageTopAction[];
          break;
        case "fields":
          fields = this.parseIdentifierArray();
          break;
        case "layout":
          layout = this.consumeString() as AutoPageLayout;
          break;
        case "submitAction":
          submitAction = this.consumeIdentifier().value;
          break;
        case "successRoute":
          successRoute = this.consumeString();
          break;
        case "auth": {
          const at = this.consume(TokenType.BOOLEAN);
          auth = at.value === "true";
          break;
        }
        case "roles":
          roles = this.parseIdentifierArray();
          break;
        default:
          throw this.error(
            "E_AUTOPAGE_UNKNOWN_PROP",
            `Unknown autoPage property '${key.value}'`,
            "Valid properties: entity, path, type, title, columns, sortable, filterable, searchable, paginate, pageSize, rowActions, topActions, fields, layout, submitAction, successRoute, auth, roles",
            key.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!entity) {
      throw this.error(
        "E_AUTOPAGE_NO_ENTITY",
        `autoPage '${name.value}' is missing required property 'entity'`,
        "Add: entity: MyEntityName",
        loc,
      );
    }
    if (!path) {
      throw this.error(
        "E_AUTOPAGE_NO_PATH",
        `autoPage '${name.value}' is missing required property 'path'`,
        'Add: path: "/my-path"',
        loc,
      );
    }
    if (!pageType) {
      throw this.error(
        "E_AUTOPAGE_NO_TYPE",
        `autoPage '${name.value}' is missing required property 'type'`,
        `Valid values: ${SUPPORTED_AUTOPAGE_TYPES.join(", ")}`,
        loc,
      );
    }

    return {
      type: "AutoPage",
      name: name.value,
      loc,
      entity,
      path,
      pageType,
      ...(title !== undefined ? { title } : {}),
      ...(columns !== undefined ? { columns } : {}),
      ...(sortable !== undefined ? { sortable } : {}),
      ...(filterable !== undefined ? { filterable } : {}),
      ...(searchable !== undefined ? { searchable } : {}),
      ...(paginate !== undefined ? { paginate } : {}),
      ...(pageSize !== undefined ? { pageSize } : {}),
      ...(rowActions !== undefined ? { rowActions } : {}),
      ...(topActions !== undefined ? { topActions } : {}),
      ...(fields !== undefined ? { fields } : {}),
      ...(layout !== undefined ? { layout } : {}),
      ...(submitAction !== undefined ? { submitAction } : {}),
      ...(successRoute !== undefined ? { successRoute } : {}),
      ...(auth !== undefined ? { auth } : {}),
      ...(roles !== undefined ? { roles } : {}),
    };
  }

  /** Parses the `cache: { store, ttl, key, invalidateOn }` sub-block inside a query */
  private parseQueryCacheConfig(loc: SourceLocation): QueryCacheConfig {
    this.consume(TokenType.LBRACE);

    let store: string | null = null;
    let ttl: number | undefined;
    let key: string | undefined;
    let invalidateOn: string[] | undefined;

    while (!this.check(TokenType.RBRACE)) {
      const innerKey = this.consumeIdentifier();
      this.consume(TokenType.COLON);

      switch (innerKey.value) {
        case "store":
          store = this.consumeIdentifier().value;
          break;
        case "ttl": {
          const tok = this.consume(TokenType.NUMBER);
          ttl = Number(tok.value);
          break;
        }
        case "key":
          key = this.consumeString();
          break;
        case "invalidateOn":
          invalidateOn = this.parseInvalidateOnArray();
          break;
        default:
          throw this.error(
            "E074_UNKNOWN_PROP",
            `Unknown query cache property '${innerKey.value}'`,
            "Valid properties: store, ttl, key, invalidateOn",
            innerKey.loc,
          );
      }
    }

    this.consume(TokenType.RBRACE);

    if (!store) {
      throw this.error(
        "E075_MISSING_CACHE_STORE",
        "Query cache block is missing store",
        "Add: store: MyCacheBlockName",
        loc,
      );
    }

    return {
      store,
      ...(ttl !== undefined ? { ttl } : {}),
      ...(key !== undefined ? { key } : {}),
      ...(invalidateOn !== undefined ? { invalidateOn } : {}),
    };
  }

  /** Parses: [Entity:operation, Entity:operation, ...] for invalidateOn arrays */
  private parseInvalidateOnArray(): string[] {
    this.consume(TokenType.LBRACKET);
    const items: string[] = [];

    while (!this.check(TokenType.RBRACKET)) {
      const entity = this.consumeIdentifier().value;
      this.consume(TokenType.COLON);
      const operation = this.consumeIdentifier().value;
      items.push(`${entity}:${operation}`);
      if (this.check(TokenType.COMMA)) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(TokenType.RBRACKET);
    return items;
  }

  /** Parses: env(VAR_NAME) and returns the env var name (e.g. "REDIS_URL") */
  private parseEnvRef(): string {
    const tok = this.consumeIdentifier();
    if (tok.value !== "env") {
      throw this.error(
        "E076_EXPECTED_ENV_REF",
        `Expected 'env(VAR_NAME)' but got '${tok.value}'`,
        "Use the env() function to reference env vars: url: env(REDIS_URL)",
        tok.loc,
      );
    }
    this.consume(TokenType.LPAREN);
    const varName = this.consumeIdentifier().value;
    this.consume(TokenType.RPAREN);
    return varName;
  }

  // ---- Value parsers ----

  /**
   * Parses both import forms:
   *   import Foo from "@src/..."        → DefaultImportExpression
   *   import { foo } from "@src/..."    → NamedImportExpression
   */
  private parseImportExpression(): ImportExpression {
    const loc = this.consume(TokenType.KW_IMPORT).loc;

    // Named import: import { foo } from "..."
    if (this.check(TokenType.LBRACE)) {
      this.consume(TokenType.LBRACE);
      const namedExport = this.consumeIdentifier().value;
      this.consume(TokenType.RBRACE);
      this.consume(TokenType.KW_FROM);
      const source = this.consumeString();
      return { kind: "named", namedExport, source };
    }

    // Default import: import Foo from "..."
    const defaultExport = this.consumeIdentifier().value;
    this.consume(TokenType.KW_FROM);
    const source = this.consumeString();
    return { kind: "default", defaultExport, source };
  }

  /** Parses: [ Foo, Bar, Baz ] */
  private parseIdentifierArray(): string[] {
    this.consume(TokenType.LBRACKET);
    const items: string[] = [];
    const seen = new Set<string>();

    while (!this.check(TokenType.RBRACKET)) {
      const tok = this.consumeIdentifier();
      if (seen.has(tok.value)) {
        throw this.error(
          "E045_DUPLICATE_ARRAY_ELEMENT",
          `Duplicate element '${tok.value}' in list`,
          "Each element in a list must be unique",
          tok.loc,
        );
      }
      seen.add(tok.value);
      items.push(tok.value);
      if (this.check(TokenType.COMMA)) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(TokenType.RBRACKET);
    return items;
  }

  /** Parses: ["foo", "bar", "baz"] */
  private parseStringArray(): string[] {
    this.consume(TokenType.LBRACKET);
    const items: string[] = [];

    while (!this.check(TokenType.RBRACKET)) {
      items.push(this.consumeString());
      if (this.check(TokenType.COMMA)) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(TokenType.RBRACKET);
    return items;
  }

  // ---- Token cursor helpers ----

  private peek(): Token {
    return (
      this.tokens[this.pos] ?? {
        type: TokenType.EOF,
        value: "",
        loc: { line: 0, col: 0, offset: 0 },
      }
    );
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private isEOF(): boolean {
    return this.check(TokenType.EOF);
  }

  private consume(type: TokenType): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw this.error(
        "E030_EXPECTED_TOKEN",
        `Expected '${type}' but got '${tok.value || tok.type}'`,
        `Add the missing '${type}'`,
        tok.loc,
      );
    }
    this.pos++;
    return tok;
  }

  private consumeIdentifier(): Token {
    const tok = this.peek();
    // Accept IDENTIFIER tokens and also block keywords (like 'entity')
    // when they appear in property-name or value position
    if (tok.type !== TokenType.IDENTIFIER && !BLOCK_KEYWORDS.has(tok.type)) {
      throw this.error(
        "E031_EXPECTED_IDENTIFIER",
        `Expected an identifier but got '${tok.value || tok.type}'`,
        "Provide a valid name (letters, digits, underscores)",
        tok.loc,
      );
    }
    this.pos++;
    return tok;
  }

  private consumeString(): string {
    const tok = this.peek();
    if (tok.type !== TokenType.STRING) {
      throw this.error(
        "E032_EXPECTED_STRING",
        `Expected a string but got '${tok.value || tok.type}'`,
        'Wrap the value in double quotes: "value"',
        tok.loc,
      );
    }
    this.pos++;
    return tok.value;
  }

  private error(
    code: string,
    message: string,
    hint: string,
    loc?: SourceLocation,
  ): ParseError {
    return new ParseError([
      { code, message, hint, ...(loc !== undefined ? { loc } : {}) },
    ]);
  }
}
