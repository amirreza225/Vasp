import { DEFAULT_BACKEND_PORT } from "@vasp-framework/core";
import type { FieldNode } from "@vasp-framework/core";
import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase, toPlural } from "../template/TemplateEngine.js";

// Built-in fields hardcoded into the schema template's auth user table block.
// Extra scalar fields must NOT duplicate these.
const AUTH_BUILTIN_FIELDS = new Set([
  "id",
  "username",
  "email",
  "password",
  "passwordHash",
  "googleId",
  "githubId",
  "createdAt",
  "updatedAt",
]);

/**
 * Map a Vasp primitive field type to its Elysia/TypeBox validator string.
 * Used to generate accurate body schema for extra user entity fields at register time.
 */
function typeToElysiaValidator(f: FieldNode): string {
  if (f.type === "Enum" && f.enumValues?.length) {
    const literals = f.enumValues.map((v) => `t.Literal('${v}')`).join(", ");
    return `t.Union([${literals}])`;
  }
  switch (f.type) {
    case "String":
    case "Text":
      return "t.String()";
    case "Int":
      return "t.Integer()";
    case "Boolean":
      return "t.Boolean()";
    case "Float":
      return "t.Number()";
    case "DateTime":
      return 't.String({ format: "date-time" })';
    case "Json":
      return "t.Any()";
    default:
      return "t.Any()";
  }
}

export class AuthGenerator extends BaseGenerator {
  run(): void {
    if (!this.ctx.ast.auth) return;

    this.ctx.logger.info("Generating auth system...");

    const { ext, ast } = this.ctx;
    const authMethods = ast.auth!.methods;
    const authPermissions = ast.auth!.permissions ?? {};
    const hasPermissions = Object.keys(authPermissions).length > 0;

    // Transform the permissions map into a template-friendly array of entries
    const permissionEntries = Object.entries(authPermissions).map(
      ([name, roles]) => ({ name, roles }),
    );

    // Collect many-to-one relation fields on the user entity.
    // These generate {name}Id FK columns in the DB that the register endpoint
    // may need to accept (e.g. workspaceId when User belongs to a Workspace).
    const userEntity = ast.entities.find(
      (e) => e.name === ast.auth!.userEntity,
    );
    // Detect password field name (either 'password' or 'passwordHash')
    const passwordField = userEntity?.fields.find(
      (f) => f.name === "password" || f.name === "passwordHash",
    );
    const passwordFieldName = passwordField?.name || "passwordHash";

    const userFkFields = (userEntity?.fields ?? [])
      .filter((f) => f.isRelation && !f.isArray)
      .map((f) => ({
        fieldName: `${toCamelCase(f.name)}Id`,
        // A FK field is required at insert when it has no DB default and is NOT NULL.
        isRequired: !f.nullable && !f.defaultValue,
      }));
    const hasUserFkFields = userFkFields.length > 0;

    // Detect whether the email field on the user entity is NOT NULL (required at insert).
    // When true, email must be provided during registration; the insert must not fall back to null.
    const emailField = userEntity?.fields.find((f) => f.name === "email");
    const emailRequired = emailField
      ? !emailField.nullable && !emailField.defaultValue
      : false;

    // Collect fields marked @hidden on the user entity (excluding the password field).
    // These will be stripped from register/login/me API responses so sensitive data
    // (e.g. stripeCustomerId, internalScore) is never returned to the client.
    const hiddenFields = (userEntity?.fields ?? [])
      .filter((f) => f.isHidden && f.name !== passwordFieldName)
      .map((f) => ({ name: f.name }));
    const hasHiddenFields = hiddenFields.length > 0;

    // Collect extra scalar fields on the user entity that need to be supplied at
    // register time. These are non-built-in, non-relation, non-File scalar fields
    // that do NOT have a DB-level default (fields with @default are handled by the DB
    // automatically and don't need to appear in the INSERT or the request body).
    //
    // Two categories are emitted to the template:
    //   isRequired=true  → NOT NULL, no default → caller MUST supply the value
    //   isRequired=false → nullable, no default  → caller MAY supply the value (null fallback)
    const authUserExtraScalarFields = (userEntity?.fields ?? [])
      .filter(
        (f) =>
          !AUTH_BUILTIN_FIELDS.has(f.name) &&
          !f.isRelation &&
          f.type !== "File" &&
          f.type !== "RichText" &&
          !f.isHidden &&
          !f.defaultValue, // DB default fields don't need to be in the INSERT/body
      )
      .map((f) => ({
        fieldName: f.name,
        type: f.type,
        elysiaType: typeToElysiaValidator(f),
        isRequired: !f.nullable,
        nullable: f.nullable,
      }));
    const hasAuthUserExtraScalarFields = authUserExtraScalarFields.length > 0;

    // Derive the Drizzle table const name from the user entity name.
    // Matches the convention used in DrizzleSchemaGenerator: toPlural(camelCase(name)).
    // e.g. "User" → "users", "Account" → "accounts", "Person" → "people"
    const userTableName = toPlural(toCamelCase(ast.auth!.userEntity));

    const data = {
      authMethods,
      backendPort: DEFAULT_BACKEND_PORT,
      hasPermissions,
      permissionEntries,
      userFkFields,
      hasUserFkFields,
      hasRequiredFkFields: userFkFields.some((f) => f.isRequired),
      hiddenFields,
      hasHiddenFields,
      passwordFieldName,
      userTableName,
      emailRequired,
      authUserExtraScalarFields,
      hasAuthUserExtraScalarFields,
    };

    // Server: auth plugin (JWT + cookie — separate file to avoid circular imports)
    this.write(
      `server/auth/plugin.${ext}`,
      this.render("shared/auth/server/plugin.hbs", data),
    );

    // Server: auth routes + JWT middleware
    this.write(
      `server/auth/index.${ext}`,
      this.render("shared/auth/server/index.hbs", data),
    );
    this.write(
      `server/auth/middleware.${ext}`,
      this.render("shared/auth/server/middleware.hbs", data),
    );

    // Server: providers
    if (authMethods.includes("usernameAndPassword")) {
      this.write(
        `server/auth/providers/usernameAndPassword.${ext}`,
        this.render(
          "shared/auth/server/providers/usernameAndPassword.hbs",
          data,
        ),
      );
    }
    if (authMethods.includes("google")) {
      this.write(
        `server/auth/providers/google.${ext}`,
        this.render("shared/auth/server/providers/google.hbs", data),
      );
    }
    if (authMethods.includes("github")) {
      this.write(
        `server/auth/providers/github.${ext}`,
        this.render("shared/auth/server/providers/github.hbs", data),
      );
    }

    // Client: auth composable (SPA only — SSR uses composables/useAuth generated by FrontendGenerator)
    if (this.ctx.isSpa) {
      this.write(
        `src/vasp/auth.${ext}`,
        this.render(`spa/${ext}/src/vasp/auth.${ext}.hbs`, data),
      );
    }

    // Login/Register Vue components (used by both SPA router and SSR Nuxt page wrappers)
    this.write(
      "src/pages/Login.vue",
      this.render("shared/auth/client/Login.vue.hbs", data),
    );
    this.write(
      "src/pages/Register.vue",
      this.render("shared/auth/client/Register.vue.hbs", data),
    );
  }
}
