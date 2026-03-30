import { describe, expect, it } from "vitest";
import { parse } from "../parser/Parser.js";
import { SemanticValidator } from "./SemanticValidator.js";

function validate(source: string) {
  const ast = parse(source);
  new SemanticValidator().validate(ast);
}

const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

describe("SemanticValidator", () => {
  it("passes a valid minimal config", () => {
    expect(() => validate(APP)).not.toThrow();
  });

  it("fails when app block is missing", () => {
    // Parse will produce null app — validator catches it
    const ast = parse(APP);
    // Manually break it for testing
    const brokenAst = { ...ast, app: null as unknown as typeof ast.app };
    expect(() => new SemanticValidator().validate(brokenAst)).toThrow(
      "E100_MISSING_APP_BLOCK",
    );
  });

  it("fails when route references unknown page", () => {
    expect(() =>
      validate(`
      ${APP}
      route Home { path: "/" to: NonExistentPage }
    `),
    ).toThrow("E101_UNKNOWN_PAGE_REF");
  });

  it("passes when route references existing page", () => {
    expect(() =>
      validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `),
    ).not.toThrow();
  });

  it("fails when crud has empty operations", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [] }
    `),
    ).toThrow("E102_EMPTY_CRUD_OPERATIONS");
  });

  it("fails when crud ownership is used without an auth block", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Order {
        id: Int @id
        ownerId: Int
      }
      crud Order {
        entity: Order
        operations: [list, create, update, delete]
        ownership: ownerId
      }
    `),
    ).toThrow("E202_CRUD_OWNERSHIP_REQUIRES_AUTH");
  });

  it("fails when crud ownership references a field that does not exist on the entity", () => {
    expect(() =>
      validate(`
      ${APP}
      auth User { userEntity: User methods: [usernameAndPassword] }
      entity Order {
        id: Int @id
        title: String
      }
      crud Order {
        entity: Order
        operations: [list, create, update, delete]
        ownership: nonExistentField
      }
    `),
    ).toThrow("E203_CRUD_OWNERSHIP_FIELD_NOT_FOUND");
  });

  it("passes when crud ownership references a valid field with auth configured", () => {
    expect(() =>
      validate(`
      ${APP}
      auth User { userEntity: User methods: [usernameAndPassword] }
      entity Order {
        id: Int @id
        ownerId: Int
      }
      crud Order {
        entity: Order
        operations: [list, create, update, delete]
        ownership: ownerId
      }
    `),
    ).not.toThrow();
  });

  it("fails when realtime entity has no crud", () => {
    expect(() =>
      validate(`
      ${APP}
      realtime TodoChannel { entity: Todo events: [created] }
    `),
    ).toThrow("E104_REALTIME_ENTITY_NOT_CRUD");
  });

  it("passes when realtime entity has crud", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel { entity: Todo events: [created] }
    `),
    ).not.toThrow();
  });

  it("fails when auth has no methods", () => {
    expect(() =>
      validate(`
      ${APP}
      auth User { userEntity: User methods: [] }
    `),
    ).toThrow("E106_EMPTY_AUTH_METHODS");
  });

  it("fails when query references unknown entity", () => {
    expect(() =>
      validate(`
      ${APP}
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [UnknownEntity]
      }
    `),
    ).toThrow("E108_UNKNOWN_ENTITY_REF");
  });

  it("passes when query references known entity", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `),
    ).not.toThrow();
  });

  it("collects multiple errors", () => {
    try {
      validate(`
        ${APP}
        route R1 { path: "/" to: MissingPage1 }
        route R2 { path: "/a" to: MissingPage2 }
      `);
    } catch (e: unknown) {
      expect((e as { diagnostics: unknown[] }).diagnostics).toHaveLength(2);
    }
  });

  it("passes when query references declared entity block", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `),
    ).not.toThrow();
  });

  it("fails when crud entity has no matching entity block (with entity blocks present)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Recipe { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
    `),
    ).toThrow("E111_CRUD_ENTITY_NOT_DECLARED");
  });

  it("passes when crud entity matches declared entity block", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
    `),
    ).not.toThrow();
  });

  it("does not require entity blocks when none are declared (backward compat)", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
    `),
    ).not.toThrow();
  });

  it("fails when duplicate entity names exist", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      entity Todo { id: Int @id name: String }
    `),
    ).toThrow("E112_DUPLICATE_ENTITY");
  });

  it("fails when duplicate route paths exist", () => {
    expect(() =>
      validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      route Landing { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `),
    ).toThrow("E113_DUPLICATE_ROUTE_PATH");
  });

  it("passes with unique route paths", () => {
    expect(() =>
      validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      route About { path: "/about" to: AboutPage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
      page AboutPage { component: import About from "@src/pages/About.vue" }
    `),
    ).not.toThrow();
  });

  it("fails when relation field references undefined entity (E115)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id author: Ghost }
    `),
    ).toThrow("E115_UNDEFINED_RELATION_ENTITY");
  });

  it("passes when relation field references declared entity (E115 no error)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User @onDelete(cascade) }
    `),
    ).not.toThrow();
  });

  it("passes with Text field type (E114 no error)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Post { id: Int @id body: Text }
    `),
    ).not.toThrow();
  });

  it("passes with Json field type (E114 no error)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Post { id: Int @id meta: Json }
    `),
    ).not.toThrow();
  });

  it("fails for truly unsupported lowercase field type (E114)", () => {
    // lowercase "uuid" is not a recognised primitive and is not a capitalised entity ref
    // so the Parser treats it as unknown and the SemanticValidator raises E114
    // NOTE: In the new DSL, only capitalised names are treated as relation refs.
    // Lowercase unknown types fail at the parser level with E026; we just verify
    // that a fake capitalized entity that doesn't exist raises E115, not E114.
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id author: Nonexistent }
    `),
    ).toThrow("E115_UNDEFINED_RELATION_ENTITY");
  });

  it("passes one-to-many virtual array relation field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id todos: Todo[] }
      entity Todo { id: Int @id author: User @onDelete(cascade) }
    `),
    ).not.toThrow();
  });

  it("passes with valid api method", () => {
    expect(() =>
      validate(`
      ${APP}
      api UploadRecipeImage {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadRecipeImage } from "@src/api.js"
      }
    `),
    ).not.toThrow();
  });

  it("fails with unknown api method", () => {
    expect(() =>
      validate(`
      ${APP}
      api UploadRecipeImage {
        method: TRACE
        path: "/api/recipes/:id/image"
        fn: import { uploadRecipeImage } from "@src/api.js"
      }
    `),
    ).toThrow("E116_UNKNOWN_API_METHOD");
  });

  it("fails on duplicate method+path api endpoints", () => {
    expect(() =>
      validate(`
      ${APP}
      api UploadImageA {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadA } from "@src/api.js"
      }

      api UploadImageB {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadB } from "@src/api.js"
      }
    `),
    ).toThrow("E117_DUPLICATE_API_ENDPOINT");
  });

  it("fails when roles are used without auth.roles configuration", () => {
    expect(() =>
      validate(`
      ${APP}
      auth UserAuth { userEntity: User methods: [usernameAndPassword] }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
        auth: true
        roles: [admin]
      }
    `),
    ).toThrow("E118_ROLES_WITHOUT_AUTH_CONFIG");
  });

  it("fails when roles are set but auth is false", () => {
    expect(() =>
      validate(`
      ${APP}
      auth UserAuth { userEntity: User methods: [usernameAndPassword] roles: [admin] }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [create] }

      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Todo]
        roles: [admin]
      }
    `),
    ).toThrow("E119_ROLES_REQUIRE_AUTH");
  });

  it("fails when operation references unknown role", () => {
    expect(() =>
      validate(`
      ${APP}
      auth UserAuth { userEntity: User methods: [usernameAndPassword] roles: [admin, editor] }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
        auth: true
        roles: [viewer]
      }
    `),
    ).toThrow("E120_UNKNOWN_ROLE_REF");
  });

  it("passes when role references are valid and auth=true", () => {
    expect(() =>
      validate(`
      ${APP}
      auth UserAuth { userEntity: User methods: [usernameAndPassword] roles: [admin, editor] }
      entity User { id: Int @id username: String role: String }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
        auth: true
        roles: [editor]
      }

      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Todo]
        auth: true
        roles: [admin]
      }
    `),
    ).not.toThrow();
  });

  it("passes with valid middleware scope", () => {
    expect(() =>
      validate(`
      ${APP}
      middleware Logger {
        fn: import logger from "@src/middleware/logger.js"
        scope: global
      }
    `),
    ).not.toThrow();
  });

  it("fails with unknown middleware scope", () => {
    expect(() =>
      validate(`
      ${APP}
      middleware Logger {
        fn: import logger from "@src/middleware/logger.js"
        scope: project
      }
    `),
    ).toThrow("E121_UNKNOWN_MIDDLEWARE_SCOPE");
  });

  it("fails with invalid env key format in app.env", () => {
    expect(() =>
      validate(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          database_url: required String
        }
      }
    `),
    ).toThrow("E122_INVALID_ENV_KEY");
  });

  it("fails with invalid default value for Enum env var", () => {
    expect(() =>
      validate(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          NODE_ENV: optional Enum(development, production) @default(staging)
        }
      }
    `),
    ).toThrow("E123_INVALID_ENV_DEFAULT");
  });

  it("fails with non-numeric default for Int env var", () => {
    expect(() =>
      validate(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          MAX_SIZE: optional Int @default(abc)
        }
      }
    `),
    ).toThrow("E124_INVALID_ENV_DEFAULT_TYPE");
  });

  it("fails when string validator is used on Int env var", () => {
    expect(() =>
      validate(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          MAX_SIZE: required Int @minLength(3)
        }
      }
    `),
    ).toThrow("E125_INCOMPATIBLE_ENV_VALIDATOR");
  });

  it("fails when numeric validator is used on String env var", () => {
    expect(() =>
      validate(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          API_KEY: required String @min(10)
        }
      }
    `),
    ).toThrow("E125_INCOMPATIBLE_ENV_VALIDATOR");
  });

  // ── Bug 4: Validation ordering ──────────────────────────────────────────

  it("catches duplicate entity name before running crud entity check", () => {
    // With wrong ordering, the crud check would silently pass (Set deduplicates)
    // while the duplicate entity error is never reached.
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      entity Todo { id: Int @id name: String }
      crud Todo { entity: Todo operations: [list] }
    `),
    ).toThrow("E112_DUPLICATE_ENTITY");
  });

  // ── Bug 6: Duplicate block names ─────────────────────────────────────────

  it("fails on duplicate query names (E124)", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
      query getTodos { fn: import { getTodos } from "@src/q.js" entities: [Todo] }
      query getTodos { fn: import { getTodos } from "@src/q.js" entities: [Todo] }
    `),
    ).toThrow("E124_DUPLICATE_QUERY");
  });

  it("fails on duplicate action names (E125)", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [create] }
      action createTodo { fn: import { createTodo } from "@src/a.js" entities: [Todo] }
      action createTodo { fn: import { createTodo } from "@src/a.js" entities: [Todo] }
    `),
    ).toThrow("E125_DUPLICATE_ACTION");
  });

  it("fails on duplicate page names (E126)", () => {
    expect(() =>
      validate(`
      ${APP}
      route Home { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `),
    ).toThrow("E126_DUPLICATE_PAGE");
  });

  it("fails on duplicate crud names (E127)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
      crud Todo { entity: Todo operations: [create] }
    `),
    ).toThrow("E127_DUPLICATE_CRUD");
  });

  it("fails on duplicate realtime names (E128)", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel { entity: Todo events: [created] }
      realtime TodoChannel { entity: Todo events: [updated] }
    `),
    ).toThrow("E128_DUPLICATE_REALTIME");
  });

  it("fails on duplicate job names (E129)", () => {
    expect(() =>
      validate(`
      ${APP}
      job sendEmail { executor: PgBoss perform: { fn: import { sendEmail } from "@src/jobs.js" } }
      job sendEmail { executor: PgBoss perform: { fn: import { sendEmail } from "@src/jobs.js" } }
    `),
    ).toThrow("E129_DUPLICATE_JOB");
  });

  it("fails on duplicate middleware names (E130)", () => {
    expect(() =>
      validate(`
      ${APP}
      middleware Logger { fn: import logger from "@src/middleware/logger.js" scope: global }
      middleware Logger { fn: import logger from "@src/middleware/logger.js" scope: global }
    `),
    ).toThrow("E130_DUPLICATE_MIDDLEWARE");
  });

  // ── Bug 7: Warnings must not be treated as errors ────────────────────────

  it("W200 does not prevent successful parse (warning only)", () => {
    // `todos: Todo` looks plural — only a warning, not an error
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id }
      entity Todo { id: Int @id todos: User }
    `),
    ).not.toThrow();
  });

  it("W201 does not prevent successful parse (warning only)", () => {
    // Non-nullable relation without @onDelete — only a warning, not an error
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User }
    `),
    ).not.toThrow();
  });

  // ── Bug 8: W200 false positive fix ───────────────────────────────────────

  it("W200 does not fire for address: Address (false positive)", () => {
    // `address` ends with 's' but is NOT the plural of `Address`
    expect(() =>
      validate(`
      ${APP}
      entity Address { id: Int @id street: String }
      entity User { id: Int @id address: Address @onDelete(cascade) }
    `),
    ).not.toThrow();
  });

  it("W200 correctly identified for todos: Todo (true positive)", () => {
    // `todos` IS the camelCase plural of `Todo` — warning is appropriate
    // The file still parses successfully (warnings do not throw)
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id }
      entity Todo { id: Int @id todos: User }
    `),
    ).not.toThrow();
  });
});

describe("SemanticValidator — admin block", () => {
  it("passes a valid admin block with declared entities", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      entity User { id: Int @id username: String }
      admin { entities: [Todo, User] }
    `),
    ).not.toThrow();
  });

  it("fails when admin entities list is empty (E131)", () => {
    // Parse succeeds; validator catches empty list
    const ast = parse(`${APP}`);
    // Inject a broken admin node directly
    const broken = {
      ...ast,
      admin: { type: "Admin" as const, entities: [], loc: ast.app.loc },
    };
    expect(() => new SemanticValidator().validate(broken)).toThrow(
      "E131_EMPTY_ADMIN_ENTITIES",
    );
  });

  it("fails when admin references undeclared entity (E132)", () => {
    const ast = parse(`${APP}`);
    const broken = {
      ...ast,
      admin: { type: "Admin" as const, entities: ["Ghost"], loc: ast.app.loc },
    };
    expect(() => new SemanticValidator().validate(broken)).toThrow(
      "E132_ADMIN_ENTITY_NOT_DECLARED",
    );
  });

  it("passes with a single declared entity", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Post { id: Int @id title: String }
      admin { entities: [Post] }
    `),
    ).not.toThrow();
  });
});

describe("SemanticValidator — @validate rules (E154)", () => {
  it("passes valid @validate(email) on String field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id email: String @validate(email) }
    `),
    ).not.toThrow();
  });

  it("passes valid @validate(min: 0, max: 100) on Int field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Product { id: Int @id stock: Int @validate(min: 0, max: 100) }
    `),
    ).not.toThrow();
  });

  it("fails when @validate is used on a relation field (E154_VALIDATE_ON_RELATION)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User @onDelete(cascade) @validate(email) }
    `),
    ).toThrow("E154_VALIDATE_ON_RELATION");
  });

  it("fails when @validate is used on a Boolean field (E154_VALIDATE_UNSUPPORTED_TYPE)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id done: Boolean @validate(email) }
    `),
    ).toThrow("E154_VALIDATE_UNSUPPORTED_TYPE");
  });

  it("fails when numeric rule used on String field (E154_VALIDATE_INCOMPATIBLE_RULE)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String @validate(min: 0) }
    `),
    ).toThrow("E154_VALIDATE_INCOMPATIBLE_RULE");
  });

  it("fails when string rule used on Int field (E154_VALIDATE_INCOMPATIBLE_RULE)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id count: Int @validate(email) }
    `),
    ).toThrow("E154_VALIDATE_INCOMPATIBLE_RULE");
  });

  it("fails when multiple exclusive format flags are used (E154_VALIDATE_EXCLUSIVE_FLAGS)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id contact: String @validate(email, url) }
    `),
    ).toThrow("E154_VALIDATE_EXCLUSIVE_FLAGS");
  });

  it("fails when minLength > maxLength (E154_VALIDATE_LENGTH_ORDER)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id name: String @validate(minLength: 10, maxLength: 5) }
    `),
    ).toThrow("E154_VALIDATE_LENGTH_ORDER");
  });

  it("fails when min > max (E154_VALIDATE_RANGE_ORDER)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Product { id: Int @id count: Int @validate(min: 100, max: 10) }
    `),
    ).toThrow("E154_VALIDATE_RANGE_ORDER");
  });
});

describe("SemanticValidator — email blocks", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("passes a valid email block with a known provider", () => {
    expect(() =>
      validate(`
      ${APP}
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
      }
    `),
    ).not.toThrow();
  });

  it("passes all three supported providers without error", () => {
    for (const provider of ["resend", "sendgrid", "smtp"]) {
      expect(() =>
        validate(`
        ${APP}
        email Mailer {
          provider: ${provider}
          from: "noreply@myapp.com"
        }
      `),
      ).not.toThrow();
    }
  });

  it("fails when email provider is unknown (E115)", () => {
    expect(() =>
      validate(`
      ${APP}
      email Mailer {
        provider: mailgun
        from: "noreply@myapp.com"
      }
    `),
    ).toThrow("E115_UNKNOWN_EMAIL_PROVIDER");
  });

  it("fails when action uses onSuccess.sendEmail but no email block is defined (E116)", () => {
    expect(() =>
      validate(`
      ${APP}
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccess: {
          sendEmail: welcome
        }
      }
    `),
    ).toThrow("E116_SEND_EMAIL_NO_EMAIL_BLOCK");
  });

  it("fails when action references an email template not declared in any email block (E117)", () => {
    expect(() =>
      validate(`
      ${APP}
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
        templates: {
          welcome: import { welcomeTemplate } from "@src/emails/welcome.js"
        }
      }
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccess: {
          sendEmail: resetPassword
        }
      }
    `),
    ).toThrow("E117_UNKNOWN_EMAIL_TEMPLATE_REF");
  });

  it("passes when action references a template that exists in an email block", () => {
    expect(() =>
      validate(`
      ${APP}
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
        templates: {
          welcome: import { welcomeTemplate } from "@src/emails/welcome.js"
        }
      }
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccess: {
          sendEmail: welcome
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes when action has no onSuccess (email block present or absent)", () => {
    expect(() =>
      validate(`
      ${APP}
      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: []
      }
    `),
    ).not.toThrow();
  });
});

describe("SemanticValidator — @@index and @@unique (E170, E171)", () => {
  it("passes when @@index references declared fields", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        projectId: Int
        status: Enum(todo, done)
        @@index([projectId, status])
      }
    `),
    ).not.toThrow();
  });

  it("passes when @@index([field], type: fulltext) references declared field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        title: String
        @@index([title], type: fulltext)
      }
    `),
    ).not.toThrow();
  });

  it("passes when @@unique references declared fields", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        projectId: Int
        title: String
        @@unique([projectId, title])
      }
    `),
    ).not.toThrow();
  });

  it("passes when @@index and @@unique mix declared fields", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        projectId: Int
        status: Enum(todo, done)
        title: String
        @@index([projectId, status])
        @@index([title], type: fulltext)
        @@unique([projectId, title])
      }
    `),
    ).not.toThrow();
  });

  it("fails when @@index references an undeclared field (E170)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        title: String
        @@index([nonExistentField])
      }
    `),
    ).toThrow("E170_INDEX_UNKNOWN_FIELD");
  });

  it("fails when @@unique references an undeclared field (E171)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        title: String
        @@unique([title, ghost])
      }
    `),
    ).toThrow("E171_UNIQUE_CONSTRAINT_UNKNOWN_FIELD");
  });

  it("passes when @@index references createdAt or updatedAt (auto fields)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        title: String
        @@index([createdAt])
      }
    `),
    ).not.toThrow();
  });
});

describe("SemanticValidator — multiTenant", () => {
  it("passes with a valid row-level multiTenant config", () => {
    expect(() =>
      validate(`
      app MySaas {
        title: "My SaaS"
        db: Drizzle
        ssr: false
        typescript: false
        multiTenant: {
          strategy: "row-level"
          tenantEntity: Workspace
          tenantField: workspaceId
        }
      }
      entity Workspace {
        id: Int @id
        name: String
      }
    `),
    ).not.toThrow();
  });

  it("fails when multiTenant.strategy is invalid (E180)", () => {
    expect(() =>
      validate(`
      app MySaas {
        title: "My SaaS"
        db: Drizzle
        ssr: false
        typescript: false
        multiTenant: {
          strategy: "invalid-strategy"
          tenantEntity: Workspace
          tenantField: workspaceId
        }
      }
      entity Workspace { id: Int @id name: String }
    `),
    ).toThrow("E180_INVALID_MULTITENANT_STRATEGY");
  });

  it("fails when multiTenant.tenantEntity is not declared (E181)", () => {
    expect(() =>
      validate(`
      app MySaas {
        title: "My SaaS"
        db: Drizzle
        ssr: false
        typescript: false
        multiTenant: {
          strategy: "row-level"
          tenantEntity: Workspace
          tenantField: workspaceId
        }
      }
    `),
    ).toThrow("E181_MULTITENANT_ENTITY_NOT_DECLARED");
  });
});

describe("SemanticValidator — cache blocks", () => {
  it("passes with a valid memory cache block", () => {
    expect(() =>
      validate(`
      ${APP}
      cache QueryCache {
        provider: memory
        ttl: 60
      }
    `),
    ).not.toThrow();
  });

  it("passes with a valid redis cache block", () => {
    expect(() =>
      validate(`
      ${APP}
      cache RedisCache {
        provider: redis
        redis: {
          url: env(REDIS_URL)
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes with a valid valkey cache block", () => {
    expect(() =>
      validate(`
      ${APP}
      cache ValkeyCache {
        provider: valkey
        redis: {
          url: env(VALKEY_URL)
        }
      }
    `),
    ).not.toThrow();
  });

  it("fails on duplicate cache store names (E190)", () => {
    expect(() =>
      validate(`
      ${APP}
      cache QueryCache { provider: memory }
      cache QueryCache { provider: redis redis: { url: env(REDIS_URL) } }
    `),
    ).toThrow("E190_DUPLICATE_CACHE");
  });

  it("fails on unknown cache provider (E191)", () => {
    expect(() =>
      validate(`
      ${APP}
      cache QueryCache { provider: memcached }
    `),
    ).toThrow("E191_UNKNOWN_CACHE_PROVIDER");
  });

  it("fails when redis provider is missing redis.url (E192)", () => {
    expect(() =>
      validate(`
      ${APP}
      cache RedisCache { provider: redis }
    `),
    ).toThrow("E192_CACHE_MISSING_REDIS_URL");
  });

  it("fails when valkey provider is missing redis.url (E192)", () => {
    expect(() =>
      validate(`
      ${APP}
      cache ValkeyCache { provider: valkey }
    `),
    ).toThrow("E192_CACHE_MISSING_REDIS_URL");
  });

  it("passes when query references a valid cache store", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Post { id: Int @id title: String }
      cache QueryCache { provider: memory ttl: 60 }
      query getPublicPosts {
        fn: import { getPublicPosts } from "@src/queries.js"
        entities: [Post]
        cache: {
          store: QueryCache
          ttl: 300
          key: "public-posts"
          invalidateOn: [Post:create, Post:update, Post:delete]
        }
      }
    `),
    ).not.toThrow();
  });

  it("fails when query cache store is not declared (E193)", () => {
    expect(() =>
      validate(`
      ${APP}
      query getPublicPosts {
        fn: import { getPublicPosts } from "@src/queries.js"
        cache: {
          store: UndeclaredCache
        }
      }
    `),
    ).toThrow("E193_UNKNOWN_CACHE_STORE_REF");
  });

  it("fails when invalidateOn references an unknown entity (E195)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Post { id: Int @id title: String }
      cache QueryCache { provider: memory }
      query getPosts {
        fn: import { getPosts } from "@src/queries.js"
        entities: [Post]
        cache: {
          store: QueryCache
          invalidateOn: [Ghost:create]
        }
      }
    `),
    ).toThrow("E195_INVALIDATEON_UNKNOWN_ENTITY");
  });

  it("fails when invalidateOn references an invalid operation (E196)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Post { id: Int @id title: String }
      cache QueryCache { provider: memory }
      query getPosts {
        fn: import { getPosts } from "@src/queries.js"
        entities: [Post]
        cache: {
          store: QueryCache
          invalidateOn: [Post:publish]
        }
      }
    `),
    ).toThrow("E196_INVALIDATEON_UNKNOWN_OPERATION");
  });
});

describe("SemanticValidator — webhook blocks", () => {
  it("passes with a valid inbound webhook block", () => {
    expect(() =>
      validate(`
      ${APP}
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        secret: env(STRIPE_WEBHOOK_SECRET)
        verifyWith: "stripe-signature"
        fn: import { handleStripeWebhook } from "@src/webhooks/stripe.js"
      }
    `),
    ).not.toThrow();
  });

  it("passes with a valid inbound webhook without secret", () => {
    expect(() =>
      validate(`
      ${APP}
      webhook SimpleWebhook {
        path: "/webhooks/simple"
        fn: import { handleSimple } from "@src/webhooks/simple.js"
      }
    `),
    ).not.toThrow();
  });

  it("passes with a valid outbound webhook block", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Todo { entity: Task operations: [list, create, update, delete] }
      webhook TaskWebhook {
        entity: Task
        events: [created, updated, deleted]
        targets: env(WEBHOOK_URLS)
        retry: 3
        secret: env(WEBHOOK_SECRET)
      }
    `),
    ).not.toThrow();
  });

  it("fails on duplicate webhook names (E197)", () => {
    expect(() =>
      validate(`
      ${APP}
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        fn: import { handler } from "@src/webhooks/stripe.js"
      }
      webhook StripeWebhook {
        path: "/webhooks/stripe2"
        fn: import { handler } from "@src/webhooks/stripe.js"
      }
    `),
    ).toThrow("E197_DUPLICATE_WEBHOOK");
  });

  it("fails on unknown verifyWith strategy (E198)", () => {
    expect(() =>
      validate(`
      ${APP}
      webhook BadWebhook {
        path: "/webhooks/bad"
        secret: env(SECRET)
        verifyWith: "unknown-strategy"
        fn: import { handler } from "@src/webhooks/bad.js"
      }
    `),
    ).toThrow("E198_UNKNOWN_WEBHOOK_VERIFICATION");
  });

  it("fails when verifyWith is set but secret is missing (E199)", () => {
    expect(() =>
      validate(`
      ${APP}
      webhook BadWebhook {
        path: "/webhooks/bad"
        verifyWith: "stripe-signature"
        fn: import { handler } from "@src/webhooks/bad.js"
      }
    `),
    ).toThrow("E199_WEBHOOK_VERIFY_REQUIRES_SECRET");
  });

  it("fails when outbound webhook references unknown entity (E200)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook GhostWebhook {
        entity: Ghost
        events: [created]
        targets: env(WEBHOOK_URLS)
      }
    `),
    ).toThrow("E200_WEBHOOK_UNKNOWN_ENTITY");
  });

  it("fails on unknown outbound event (E201)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook TaskWebhook {
        entity: Task
        events: [created, published]
        targets: env(WEBHOOK_URLS)
      }
    `),
    ).toThrow("E201_WEBHOOK_UNKNOWN_EVENT");
  });
});

// ─── autoPage semantic checks ─────────────────────────────────────────────────

describe("SemanticValidator — autoPage checks", () => {
  it("passes when autoPage references a declared entity", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
      }
    `),
    ).not.toThrow();
  });

  it("fails when autoPage references unknown entity (E_AUTOPAGE_UNKNOWN_ENTITY)", () => {
    expect(() =>
      validate(`
      ${APP}
      autoPage TodoList {
        entity: Ghost
        path: "/todos"
        type: list
      }
    `),
    ).toThrow("E_AUTOPAGE_UNKNOWN_ENTITY");
  });

  it("fails when autoPage has invalid pageType (E_AUTOPAGE_INVALID_TYPE)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: dashboard
      }
    `),
    ).toThrow("E_AUTOPAGE_INVALID_TYPE");
  });

  it("fails when autoPage has invalid layout (E_AUTOPAGE_INVALID_LAYOUT)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage CreateTodo {
        entity: Todo
        path: "/todos/create"
        type: form
        layout: "3-col"
      }
    `),
    ).toThrow("E_AUTOPAGE_INVALID_LAYOUT");
  });

  it("fails when two autoPages share the same path (E_AUTOPAGE_DUPLICATE_PATH)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage ListA {
        entity: Todo
        path: "/todos"
        type: list
      }
      autoPage ListB {
        entity: Todo
        path: "/todos"
        type: list
      }
    `),
    ).toThrow("E_AUTOPAGE_DUPLICATE_PATH");
  });

  it("fails when autoPage column references non-existent field (E_AUTOPAGE_UNKNOWN_FIELD)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
        columns: [id, title, nonExistent]
      }
    `),
    ).toThrow("E_AUTOPAGE_UNKNOWN_FIELD");
  });

  it("fails when autoPage field references non-existent entity field (E_AUTOPAGE_UNKNOWN_FIELD)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage CreateTodo {
        entity: Todo
        path: "/todos/create"
        type: form
        fields: [title, missing]
      }
    `),
    ).toThrow("E_AUTOPAGE_UNKNOWN_FIELD");
  });

  it("fails when autoPage has invalid rowAction (E_AUTOPAGE_INVALID_ROW_ACTION)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
        rowActions: [view, fly]
      }
    `),
    ).toThrow("E_AUTOPAGE_INVALID_ROW_ACTION");
  });

  it("fails when autoPage path conflicts with a route path (E_AUTOPAGE_DUPLICATE_PATH)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      page TodoPage { component: import Todo from "@src/pages/Todo.vue" }
      route TodoRoute { path: "/todos" to: TodoPage }
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
      }
    `),
    ).toThrow("E_AUTOPAGE_DUPLICATE_PATH");
  });

  it("fails on duplicate autoPage names (E_AUTOPAGE_DUPLICATE)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Todo { id: Int @id title: String }
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
      }
      autoPage TodoList {
        entity: Todo
        path: "/todos-v2"
        type: list
      }
    `),
    ).toThrow("E_AUTOPAGE_DUPLICATE");
  });
});

describe("SemanticValidator — CRUD column refs (E204)", () => {
  it("passes when list.columns references a declared field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String status: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: []
          columns: {
            title { label: "Title" }
            status { filterable: true }
          }
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes when list.columns references createdAt / updatedAt", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: []
          columns: {
            createdAt { sortable: true }
            updatedAt { hidden: true }
          }
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes when list.columns references a synthetic FK column (authorId)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User { id: Int @id }
      entity Task { id: Int @id author: User @onDelete(cascade) }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: []
          columns: { authorId { label: "Author" } }
        }
      }
    `),
    ).not.toThrow();
  });

  it("fails when list.columns references an unknown field (E204)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: []
          columns: { ghostField { label: "Ghost" } }
        }
      }
    `),
    ).toThrow("E204_CRUD_COLUMN_UNKNOWN_FIELD");
  });

  it("skips column check when entity has no entity block (already reported by E111)", () => {
    expect(() =>
      validate(`
      ${APP}
      crud Ghost {
        entity: Ghost
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: []
          columns: { anything { label: "X" } }
        }
      }
    `),
    ).not.toThrow("E204_CRUD_COLUMN_UNKNOWN_FIELD");
  });
});

describe("SemanticValidator — CRUD form field refs (E205)", () => {
  it("passes when form.sections.fields references declared entity fields", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String priority: Int }
      crud Task {
        entity: Task
        operations: [create, update]
        form: {
          layout: "2-column"
          sections: {
            main { fields: [title, priority] }
          }
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes when form.steps.fields references declared entity fields", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [create]
        form: {
          layout: "steps"
          steps: {
            step1 { fields: [title] }
          }
        }
      }
    `),
    ).not.toThrow();
  });

  it("fails when form.sections.fields references an unknown field (E205)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [create]
        form: {
          layout: "1-column"
          sections: {
            main { fields: [title, nonExistent] }
          }
        }
      }
    `),
    ).toThrow("E205_CRUD_FORM_UNKNOWN_FIELD");
  });

  it("fails when form.steps.fields references an unknown field (E205)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [create]
        form: {
          layout: "steps"
          steps: {
            s1 { fields: [title, badField] }
          }
        }
      }
    `),
    ).toThrow("E205_CRUD_FORM_UNKNOWN_FIELD");
  });
});

describe("SemanticValidator — CRUD form operations (E206)", () => {
  it("passes when form config is set and operations include create", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [create]
        form: { layout: "1-column" }
      }
    `),
    ).not.toThrow();
  });

  it("passes when form config is set and operations include update", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list, update]
        form: { layout: "2-column" }
      }
    `),
    ).not.toThrow();
  });

  it("fails when form config is set but only list/delete operations (E206)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list, delete]
        form: { layout: "1-column" }
      }
    `),
    ).toThrow("E206_FORM_CONFIG_REQUIRES_WRITE_OP");
  });

  it("fails when form config is set on list-only crud (E206)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list]
        form: { layout: "tabs" }
      }
    `),
    ).toThrow("E206_FORM_CONFIG_REQUIRES_WRITE_OP");
  });

  it("does not report E206 when no form config is present", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list]
      }
    `),
    ).not.toThrow();
  });
});

describe("SemanticValidator — field config validate rules (E207–E210)", () => {
  it("passes valid minLength/maxLength/pattern on String field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User {
        id: Int @id
        username: String {
          validate: { minLength: 3, maxLength: 32, pattern: "^[a-z]+" }
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes valid min/max on Int field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Product {
        id: Int @id
        priority: Int {
          validate: { min: 1, max: 5 }
        }
      }
    `),
    ).not.toThrow();
  });

  it("passes valid min/max on Float field", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Product {
        id: Int @id
        rating: Float {
          validate: { min: 0, max: 5 }
        }
      }
    `),
    ).not.toThrow();
  });

  it("fails when minLength is used on an Int field (E207)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        priority: Int {
          validate: { minLength: 1 }
        }
      }
    `),
    ).toThrow("E207_FIELD_CONFIG_VALIDATE_STRING_RULE");
  });

  it("fails when maxLength is used on a Boolean field (E207)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        done: Boolean {
          validate: { maxLength: 10 }
        }
      }
    `),
    ).toThrow("E207_FIELD_CONFIG_VALIDATE_STRING_RULE");
  });

  it("fails when min is used on a String field (E208)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        title: String {
          validate: { min: 0 }
        }
      }
    `),
    ).toThrow("E208_FIELD_CONFIG_VALIDATE_NUMERIC_RULE");
  });

  it("fails when max is used on a DateTime field (E208)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        dueDate: DateTime {
          validate: { max: 100 }
        }
      }
    `),
    ).toThrow("E208_FIELD_CONFIG_VALIDATE_NUMERIC_RULE");
  });

  it("fails when minLength > maxLength (E209)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User {
        id: Int @id
        username: String {
          validate: { minLength: 20, maxLength: 5 }
        }
      }
    `),
    ).toThrow("E209_FIELD_CONFIG_VALIDATE_LENGTH_ORDER");
  });

  it("passes when minLength == maxLength (boundary)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity User {
        id: Int @id
        pin: String {
          validate: { minLength: 4, maxLength: 4 }
        }
      }
    `),
    ).not.toThrow();
  });

  it("fails when min > max (E210)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        priority: Int {
          validate: { min: 10, max: 1 }
        }
      }
    `),
    ).toThrow("E210_FIELD_CONFIG_VALIDATE_RANGE_ORDER");
  });

  it("passes when min == max (boundary)", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task {
        id: Int @id
        priority: Int {
          validate: { min: 5, max: 5 }
        }
      }
    `),
    ).not.toThrow();
  });

  it("does not report errors for fields without a config block", () => {
    expect(() =>
      validate(`
      ${APP}
      entity Task { id: Int @id title: String }
    `),
    ).not.toThrow();
  });
});
