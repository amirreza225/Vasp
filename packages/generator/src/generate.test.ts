import { parse } from "@vasp-framework/parser";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { generate, detectDestructiveSchemaChanges } from "./generate.js";
import { Manifest } from "./manifest/Manifest.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR, MINIMAL_VASP } from "./test-helpers.js";
import * as EmailGeneratorModule from "./generators/EmailGenerator.js";
import * as FrontendGeneratorModule from "./generators/FrontendGenerator.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "generate");

// Shared engine instance — avoids creating 47 separate Handlebars environments
// and compiling ~97 templates per test (the main cause of OOM in CI).
let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

const TS_VASP = `
app TsApp {
  title: "TypeScript App"
  db: Drizzle
  ssr: false
  typescript: true
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

crud Todo {
  entity: Todo
  operations: [list, create]
}

query getTodos {
  fn: import { getTodos } from "@src/queries.ts"
  entities: [Todo]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.ts"
  entities: [Todo]
}
`;

const WITH_QUERY_VASP = `
app TodoApp {
  title: "Todo App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}

query getTodos {
  fn: import { getTodos } from "@src/queries.js"
  entities: [Todo]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.js"
  entities: [Todo]
}
`;

const WITH_API_VASP = `
app ApiApp {
  title: "API App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

api uploadRecipeImage {
  method: POST
  path: "/api/recipes/:id/image"
  fn: import { uploadRecipeImage } from "@src/api.js"
  auth: true
}
`;

const WITH_RBAC_VASP = `
app RbacApp {
  title: "RBAC App"
  db: Drizzle
  ssr: false
  typescript: false
}

auth UserAuth {
  userEntity: User
  methods: [usernameAndPassword]
  roles: [admin, editor]
}

entity User {
  id: Int @id
  username: String
  role: String
}

entity Todo {
  id: Int @id
  title: String
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

crud Todo {
  entity: Todo
  operations: [list, create]
}

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

api uploadRecipeImage {
  method: POST
  path: "/api/recipes/:id/image"
  fn: import { uploadRecipeImage } from "@src/api.js"
  auth: true
  roles: [admin]
}
`;

const WITH_MIDDLEWARE_VASP = `
app MiddlewareApp {
  title: "Middleware App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

middleware Logger {
  fn: import logger from "@src/middleware/logger.js"
  scope: global
}

middleware RouteOnly {
  fn: import routeOnly from "@src/middleware/routeOnly.js"
  scope: route
}
`;

const WITH_ENV_SCHEMA_VASP = `
app EnvApp {
  title: "Env App"
  db: Drizzle
  ssr: false
  typescript: false
  env: {
    DATABASE_URL: required String
    JWT_SECRET: required String @minLength(32)
    STRIPE_KEY: required String @startsWith("sk_")
    GOOGLE_CLIENT_ID: optional String
    MAX_UPLOAD_SIZE: optional Int @default(10485760)
    NODE_ENV: required Enum(development, staging, production)
  }
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`;

const WITH_SEED_VASP = `
app SeedApp {
  title: "Seed App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

seed {
  fn: import seedData from "@src/seed.js"
}
`;

describe("generate()", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("generates files for a minimal SPA+JS app", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "minimal");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.filesWritten.length).toBeGreaterThan(0);

    // Key files must exist
    expect(existsSync(join(outputDir, "package.json"))).toBe(true);
    expect(existsSync(join(outputDir, "bunfig.toml"))).toBe(true);
    expect(existsSync(join(outputDir, "drizzle/schema.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/index.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/db/client.js"))).toBe(true);
    expect(existsSync(join(outputDir, "index.html"))).toBe(true);
    expect(existsSync(join(outputDir, "vite.config.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/main.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/App.vue"))).toBe(true);
    expect(existsSync(join(outputDir, "src/router/index.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/vasp/plugin.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/vasp/client/index.js"))).toBe(true);
  });

  it("package.json contains correct app name", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "pkg-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const pkg = JSON.parse(
      readFileSync(join(outputDir, "package.json"), "utf8"),
    );
    expect(pkg.name).toBe("minimal-app");
    expect(pkg.dependencies).toHaveProperty("elysia");
    expect(pkg.dependencies).toHaveProperty("vue");
    expect(pkg.dependencies).toHaveProperty("@vasp-framework/runtime");
  });

  it("generates query and action route files", () => {
    const ast = parse(WITH_QUERY_VASP);
    const outputDir = join(TMP_DIR, "with-query");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(
      existsSync(join(outputDir, "server/routes/queries/getTodos.js")),
    ).toBe(true);
    expect(
      existsSync(join(outputDir, "server/routes/actions/createTodo.js")),
    ).toBe(true);
    expect(existsSync(join(outputDir, "src/vasp/client/queries.js"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/vasp/client/actions.js"))).toBe(
      true,
    );
  });

  it("server/index.js imports generated routes", () => {
    const ast = parse(WITH_QUERY_VASP);
    const outputDir = join(TMP_DIR, "server-imports");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("getTodosRoute");
    expect(serverIndex).toContain("createTodoRoute");
  });

  describe("resolveServerImport — @src/ paths resolve correctly for every nesting depth", () => {
    it("depth 3 (server/routes/queries/): @src/queries.js → ../../../src/queries.js", () => {
      const ast = parse(WITH_QUERY_VASP);
      const outputDir = join(TMP_DIR, "resolve-depth-queries");
      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });
      const queryRoute = readFileSync(
        join(outputDir, "server/routes/queries/getTodos.js"),
        "utf8",
      );
      expect(queryRoute).toContain("from '../../../src/queries.js'");
    });

    it("depth 3 (server/routes/actions/): @src/actions.js → ../../../src/actions.js", () => {
      const ast = parse(WITH_QUERY_VASP);
      const outputDir = join(TMP_DIR, "resolve-depth-actions");
      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });
      const actionRoute = readFileSync(
        join(outputDir, "server/routes/actions/createTodo.js"),
        "utf8",
      );
      expect(actionRoute).toContain("from '../../../src/actions.js'");
    });

    it("depth 2 (server/db/): @src/seed.js → ../../src/seed.js", () => {
      const ast = parse(WITH_SEED_VASP);
      const outputDir = join(TMP_DIR, "resolve-depth-seed");
      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });
      const seedRunner = readFileSync(
        join(outputDir, "server/db/seed.js"),
        "utf8",
      );
      expect(seedRunner).toContain("from '../../src/seed.js'");
    });

    it("depth 2 (server/jobs/): @src/jobs.js → ../../src/jobs.js", () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/P.vue" }
        job sendWelcome {
          executor: PgBoss
          perform: { fn: import { sendWelcome } from "@src/jobs.js" }
        }
      `;
      const ast = parse(source);
      const outputDir = join(TMP_DIR, "resolve-depth-jobs");
      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });
      const workerFile = readFileSync(
        join(outputDir, "server/jobs/sendWelcome.js"),
        "utf8",
      );
      expect(workerFile).toContain("from '../../src/jobs.js'");
    });

    it("depth 1 (server/): @src/middleware/logger.js → ../src/middleware/logger.js", () => {
      const ast = parse(WITH_MIDDLEWARE_VASP);
      const outputDir = join(TMP_DIR, "resolve-depth-middleware");
      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });
      const serverIndex = readFileSync(
        join(outputDir, "server/index.js"),
        "utf8",
      );
      expect(serverIndex).toContain("from '../src/middleware/logger.js'");
    });

    it("non-@src/ source is returned unchanged", () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/P.vue" }
        query getItems {
          fn: import { getItems } from "some-external-lib"
          entities: []
        }
      `;
      const ast = parse(source);
      const outputDir = join(TMP_DIR, "resolve-non-src");
      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });
      const queryRoute = readFileSync(
        join(outputDir, "server/routes/queries/getItems.js"),
        "utf8",
      );
      expect(queryRoute).toContain("from 'some-external-lib'");
    });
  });

  it("generates custom api route files and wires them in server index", () => {
    const ast = parse(WITH_API_VASP);
    const outputDir = join(TMP_DIR, "with-api");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(
      existsSync(join(outputDir, "server/routes/api/uploadRecipeImage.js")),
    ).toBe(true);

    const apiRoute = readFileSync(
      join(outputDir, "server/routes/api/uploadRecipeImage.js"),
      "utf8",
    );
    expect(apiRoute).toContain(".post(");
    expect(apiRoute).toContain("/api/recipes/:id/image");
    expect(apiRoute).toContain("requireAuth");

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("uploadRecipeImageApiRoute");
  });

  it("emits requireRole guards for role-protected query/action/api routes", () => {
    const ast = parse(WITH_RBAC_VASP);
    const outputDir = join(TMP_DIR, "with-rbac");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const queryRoute = readFileSync(
      join(outputDir, "server/routes/queries/getTodos.js"),
      "utf8",
    );
    expect(queryRoute).toContain("requireRole");
    expect(queryRoute).toContain(".use(requireRole(['editor']))");

    const actionRoute = readFileSync(
      join(outputDir, "server/routes/actions/createTodo.js"),
      "utf8",
    );
    expect(actionRoute).toContain(".use(requireRole(['admin']))");

    const apiRoute = readFileSync(
      join(outputDir, "server/routes/api/uploadRecipeImage.js"),
      "utf8",
    );
    expect(apiRoute).toContain(".use(requireRole(['admin']))");

    const authMiddleware = readFileSync(
      join(outputDir, "server/auth/middleware.js"),
      "utf8",
    );
    expect(authMiddleware).toContain("export function requireRole");
  });

  it("wires global middleware in server index and creates src middleware stubs", () => {
    const ast = parse(WITH_MIDDLEWARE_VASP);
    const outputDir = join(TMP_DIR, "with-middleware");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain(
      "import loggerMiddleware from '../src/middleware/logger.js'",
    );
    expect(serverIndex).toContain(".use(loggerMiddleware)");

    expect(serverIndex).not.toContain(
      "import routeOnly from '../src/middleware/routeOnly.js'",
    );
    expect(serverIndex).not.toContain(".use(routeOnly)");

    expect(existsSync(join(outputDir, "src/middleware/logger.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/middleware/routeOnly.js"))).toBe(
      true,
    );
  });

  it("generates startup env validation for required app.env keys", () => {
    const ast = parse(WITH_ENV_SCHEMA_VASP);
    const outputDir = join(TMP_DIR, "with-env-schema");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    // Required vars checked for presence
    expect(serverIndex).toContain("DATABASE_URL is required");
    expect(serverIndex).toContain("JWT_SECRET is required");
    expect(serverIndex).toContain("STRIPE_KEY is required");
    expect(serverIndex).toContain("NODE_ENV is required");
    // Type validation
    expect(serverIndex).toContain("must be an integer");
    expect(serverIndex).toContain("must be one of:");
    // Validator checks
    expect(serverIndex).toContain("must be at least 32 characters long");
    expect(serverIndex).toContain('must start with "sk_"');
    // Default applied for optional var
    expect(serverIndex).toContain("process.env.MAX_UPLOAD_SIZE = '10485760'");
    // Optional var without validators not checked for presence
    expect(serverIndex).not.toContain("GOOGLE_CLIENT_ID is required");
    // Error reporting
    expect(serverIndex).toContain("Environment variable validation failed");
    expect(serverIndex).toContain("process.exit(1)");
  });

  it("generates seed runner, script, and source seed stub", () => {
    const ast = parse(WITH_SEED_VASP);
    const outputDir = join(TMP_DIR, "with-seed");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/db/seed.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/seed.js"))).toBe(true);

    const seedRunner = readFileSync(
      join(outputDir, "server/db/seed.js"),
      "utf8",
    );
    expect(seedRunner).toContain("import seedData from '../../src/seed.js'");
    expect(seedRunner).toContain("Seed completed");

    const pkg = JSON.parse(
      readFileSync(join(outputDir, "package.json"), "utf8"),
    );
    expect(pkg.scripts["db:seed"]).toBe("bun server/db/seed.js");
  });

  it("router/index.js includes generated routes", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "router-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const router = readFileSync(join(outputDir, "src/router/index.js"), "utf8");
    expect(router).toContain("path: '/'");
    expect(router).toContain("@src/pages/Home.vue");
  });

  it("scaffolds empty page Vue files", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "page-scaffold");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "src/pages/Home.vue"))).toBe(true);
  });

  it("TypeScript mode: generates .ts files and tsconfig.json", () => {
    const ast = parse(TS_VASP);
    const outputDir = join(TMP_DIR, "ts-mode");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Key TypeScript files
    expect(existsSync(join(outputDir, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(outputDir, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "src/main.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "src/router/index.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "src/vasp/plugin.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "server/index.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "server/db/client.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "drizzle/schema.ts"))).toBe(true);

    // No .js files for main app entry points
    expect(existsSync(join(outputDir, "src/main.js"))).toBe(false);
    expect(existsSync(join(outputDir, "vite.config.js"))).toBe(false);
  });

  it("TypeScript mode: generates typed client SDK", () => {
    const ast = parse(TS_VASP);
    const outputDir = join(TMP_DIR, "ts-sdk");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "src/vasp/client/queries.ts"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/vasp/client/actions.ts"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/vasp/client/types.ts"))).toBe(true);

    const queries = readFileSync(
      join(outputDir, "src/vasp/client/queries.ts"),
      "utf8",
    );
    expect(queries).toContain("Promise<GetTodosReturn>");

    const types = readFileSync(
      join(outputDir, "src/vasp/client/types.ts"),
      "utf8",
    );
    expect(types).toContain("GetTodosArgs");
    expect(types).toContain("CreateTodoArgs");
  });

  it("TypeScript mode: drizzle schema includes InferSelectModel", () => {
    const ast = parse(TS_VASP);
    const outputDir = join(TMP_DIR, "ts-schema");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.ts"), "utf8");
    expect(schema).toContain("InferSelectModel");
    expect(schema).toContain("InferInsertModel");
  });

  it("generates auth server files when auth block present", () => {
    const source = `
      app AuthApp {
        title: "Auth App"
        db: Drizzle
        ssr: false
        typescript: false
      }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword, google ]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/auth/index.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/auth/middleware.js"))).toBe(true);
    expect(
      existsSync(
        join(outputDir, "server/auth/providers/usernameAndPassword.js"),
      ),
    ).toBe(true);
    expect(existsSync(join(outputDir, "server/auth/providers/google.js"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "server/auth/providers/github.js"))).toBe(
      false,
    ); // not in methods
    expect(existsSync(join(outputDir, "src/vasp/auth.js"))).toBe(true);
    expect(existsSync(join(outputDir, "src/pages/Login.vue"))).toBe(true);
    expect(existsSync(join(outputDir, "src/pages/Register.vue"))).toBe(true);
  });

  it("auto-injects JWT_SECRET startup validation when auth block is present without app.env", () => {
    const source = `
      app AuthEnvApp {
        title: "Auth Env App"
        db: Drizzle
        ssr: false
        typescript: false
      }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword ]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-env-auto");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("JWT_SECRET is required");
    expect(serverIndex).toContain("must be at least 64 characters long");
    expect(serverIndex).toContain("process.exit(1)");
  });

  it("does not duplicate JWT_SECRET validation when user already declared it in app.env", () => {
    const source = `
      app AuthEnvUserApp {
        title: "Auth Env User App"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          JWT_SECRET: required String @minLength(128)
        }
      }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword ]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-env-user");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    // User's @minLength(128) should be respected, not the auto-injected 64
    expect(serverIndex).toContain("must be at least 128 characters long");
    expect(serverIndex).not.toContain("must be at least 64 characters long");
    // JWT_SECRET must appear exactly once in the required-check error messages
    const occurrences = (serverIndex.match(/JWT_SECRET is required/g) ?? [])
      .length;
    expect(occurrences).toBe(1);
  });

  it("auto-injects DATABASE_URL startup validation for every app without app.env", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "db-url-auto");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("DATABASE_URL is required");
    expect(serverIndex).toContain("process.exit(1)");
  });

  it("does not duplicate DATABASE_URL validation when user already declared it in app.env", () => {
    const source = `
      app DbEnvApp {
        title: "DB Env App"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required String @startsWith("postgres://")
        }
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "db-url-no-dup");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    // User's @startsWith("postgres://") should be respected
    expect(serverIndex).toContain('must start with "postgres://"');
    // DATABASE_URL must appear exactly once in the required-check error messages
    const occurrences = (serverIndex.match(/DATABASE_URL is required/g) ?? [])
      .length;
    expect(occurrences).toBe(1);
  });

  it("auto-injects GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET when google auth is enabled", () => {
    const source = `
      app GoogleAuthApp {
        title: "Google Auth App"
        db: Drizzle
        ssr: false
        typescript: false
      }
      auth User {
        userEntity: User
        methods: [google]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "google-auth-auto");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("GOOGLE_CLIENT_ID is required");
    expect(serverIndex).toContain("GOOGLE_CLIENT_SECRET is required");
    expect(serverIndex).toContain("process.exit(1)");
  });

  it("does not duplicate GOOGLE vars when user already declared them in app.env", () => {
    const source = `
      app GoogleEnvApp {
        title: "Google Env App"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          GOOGLE_CLIENT_ID: required String
          GOOGLE_CLIENT_SECRET: required String
        }
      }
      auth User {
        userEntity: User
        methods: [google]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "google-auth-no-dup");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    const clientIdOccurrences = (
      serverIndex.match(/GOOGLE_CLIENT_ID is required/g) ?? []
    ).length;
    const clientSecretOccurrences = (
      serverIndex.match(/GOOGLE_CLIENT_SECRET is required/g) ?? []
    ).length;
    expect(clientIdOccurrences).toBe(1);
    expect(clientSecretOccurrences).toBe(1);
  });

  it("auto-injects GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET when github auth is enabled", () => {
    const source = `
      app GithubAuthApp {
        title: "GitHub Auth App"
        db: Drizzle
        ssr: false
        typescript: false
      }
      auth User {
        userEntity: User
        methods: [github]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "github-auth-auto");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("GITHUB_CLIENT_ID is required");
    expect(serverIndex).toContain("GITHUB_CLIENT_SECRET is required");
    expect(serverIndex).toContain("process.exit(1)");
  });

  it("does not duplicate GITHUB vars when user already declared them in app.env", () => {
    const source = `
      app GithubEnvApp {
        title: "GitHub Env App"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          GITHUB_CLIENT_ID: required String
          GITHUB_CLIENT_SECRET: required String
        }
      }
      auth User {
        userEntity: User
        methods: [github]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "github-auth-no-dup");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    const clientIdOccurrences = (
      serverIndex.match(/GITHUB_CLIENT_ID is required/g) ?? []
    ).length;
    const clientSecretOccurrences = (
      serverIndex.match(/GITHUB_CLIENT_SECRET is required/g) ?? []
    ).length;
    expect(clientIdOccurrences).toBe(1);
    expect(clientSecretOccurrences).toBe(1);
  });

  it("users table is generated in schema when auth is present", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User { userEntity: User methods: [usernameAndPassword] }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-schema");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    expect(schema).toContain("users");
    expect(schema).toContain("passwordHash");
  });

  it("schema uses passwordFieldName from userEntity definition, not hardcoded 'passwordHash'", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User { userEntity: User methods: [usernameAndPassword] }
      entity User {
        id: Int @id
        username: String @unique
        password: String
      }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-schema-password-field");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    // When the entity defines 'password' (not 'passwordHash'), the column must match
    expect(schema).toContain("password: text('password')");
    // The old hardcoded form must NOT appear
    expect(schema).not.toContain("passwordHash: text('password_hash')");
  });

  it("schema uses userEntity name for auth table, not hardcoded 'users'", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth Account { userEntity: Account methods: [usernameAndPassword] }
      entity Account {
        id: Int @id
        username: String @unique
      }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-schema-account");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    // Auth table should use the entity name, not hardcoded 'users'
    expect(schema).toContain("export const accounts = pgTable('accounts'");
    expect(schema).toContain("passwordHash");
    // No separate hardcoded 'users' table should exist
    expect(schema).not.toContain("export const users = pgTable('users'");
  });

  it("schema TypeScript types use userEntity name for auth table", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: true typescript: true }
      auth Account { userEntity: Account methods: [usernameAndPassword] }
      entity Account {
        id: Int @id
        username: String @unique
      }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-schema-account-ts");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.ts"), "utf8");
    // TypeScript types should reflect the entity name
    expect(schema).toContain(
      "export type Account = InferSelectModel<typeof accounts>",
    );
    expect(schema).toContain(
      "export type NewAccount = InferInsertModel<typeof accounts>",
    );
    // No User/NewUser types from old hardcoded template
    expect(schema).not.toContain("export type User = InferSelectModel");
    expect(schema).not.toContain("export type NewUser = InferInsertModel");
  });

  it("schema relations block uses userEntity table name, not hardcoded 'users'", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth Account { userEntity: Account methods: [usernameAndPassword] }
      entity Account {
        id: Int @id
        username: String @unique
        todos: Todo[]
      }
      entity Todo {
        id: Int @id
        title: String
        owner: Account @onDelete(cascade)
      }
      crud Todo { entity: Todo operations: [list, create, update, delete] }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-schema-account-relations");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    // Auth user relations block should use the entity table name
    expect(schema).toContain("accountsRelations = relations(accounts");
    expect(schema).toContain("many(todos)");
    // FK references should use 'accounts' not 'users'
    expect(schema).toContain("references(() => accounts.id");
    // No hardcoded 'usersRelations' or 'users' table
    expect(schema).not.toContain("usersRelations = relations(users");
    expect(schema).not.toContain("export const users = pgTable");
  });

  it("strips @hidden fields from auth register/login/me responses", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User { userEntity: User methods: [usernameAndPassword] }
      entity User {
        id: Int @id
        username: String @unique
        passwordHash: String
        stripeCustomerId: String @hidden
        internalScore: Int @nullable @hidden
      }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "auth-hidden-fields");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const provider = readFileSync(
      join(outputDir, "server/auth/providers/usernameAndPassword.js"),
      "utf8",
    );
    // Both register and login should strip hidden fields via destructuring
    expect(provider).toContain("stripeCustomerId: _stripeCustomerId");
    expect(provider).toContain("internalScore: _internalScore");

    const authIndex = readFileSync(
      join(outputDir, "server/auth/index.js"),
      "utf8",
    );
    // /me endpoint should also strip hidden fields
    expect(authIndex).toContain("stripeCustomerId: _stripeCustomerId");
    expect(authIndex).toContain("internalScore: _internalScore");
  });

  it("drizzle schema has correct entity tables", () => {
    const ast = parse(WITH_QUERY_VASP);
    const outputDir = join(TMP_DIR, "schema-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    expect(schema).toContain("todos");
  });

  it("generates CRUD route files and client helpers", () => {
    const ast = parse(WITH_QUERY_VASP);
    const outputDir = join(TMP_DIR, "crud-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/routes/crud/todo.js"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/vasp/client/crud.js"))).toBe(true);

    const route = readFileSync(
      join(outputDir, "server/routes/crud/todo.js"),
      "utf8",
    );
    expect(route).toContain("prefix: '/api/crud/todo'");
    expect(route).toContain(".get('/'"); // list
    expect(route).toContain(".post('/'"); // create

    const crud = readFileSync(
      join(outputDir, "src/vasp/client/crud.js"),
      "utf8",
    );
    expect(crud).toContain("useTodoCrud");
  });

  it("generates CRUD with ownership — adds WHERE ownerId condition and auto-sets on create", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      auth User { userEntity: User methods: [usernameAndPassword] }
      entity Order {
        id: Int @id
        title: String
        ownerId: Int
      }
      crud Order {
        entity: Order
        operations: [list, create, update, delete]
        ownership: ownerId
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "crud-ownership-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/order.js"),
      "utf8",
    );

    // Auth middleware should be applied (ownership requires auth)
    expect(route).toContain("requireAuth");
    expect(route).toContain(".use(requireAuth)");

    // GET / (list): should filter by owner
    expect(route).toContain("eq(table.ownerId, _ownerId)");

    // GET /:id: should add ownership WHERE condition
    expect(route).toContain(
      "and(eq(orders.id, Number(id)), eq(orders.ownerId, _ownerId))",
    );

    // POST / (create): should auto-set ownerId
    expect(route).toContain("ownerId: _ownerId");

    // PUT /:id: should add ownership WHERE condition
    // DELETE /:id: should add ownership WHERE condition
    // (both appear in the same WHERE pattern)
    const ownershipWhereCount = (
      route.match(/eq\(orders\.ownerId, _ownerId\)/g) ?? []
    ).length;
    // Appears in GET/:id, PUT/:id, DELETE/:id = at least 3 times
    expect(ownershipWhereCount).toBeGreaterThanOrEqual(3);

    // Should NOT expose records without ownership check
    expect(route).not.toContain("eq(orders.id, Number(id)))"); // plain single-condition WHERE
  });

  it("CRUD list filter uses entity-derived allowlist, not open-ended table[field] access", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Product {
        id: Int @id
        name: String
        status: String
        internalNote: String @hidden
      }
      crud Product { entity: Product operations: [list] }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "crud-filter-allowlist");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/product.js"),
      "utf8",
    );

    // Must use an explicit allowlist of declared non-hidden field names
    expect(route).toContain("FILTERABLE_FIELDS");
    expect(route).toContain("'name'");
    expect(route).toContain("'status'");
    // @hidden field must NOT be in the allowlist
    expect(route).not.toContain("'internalNote'");
    // The old open-ended pattern must be absent
    expect(route).not.toContain("Object.entries(query)");
    expect(route).not.toContain("key.slice(7)");
  });

  it("generates realtime WebSocket channel files", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel { entity: Todo events: [created, updated] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "realtime-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(
      existsSync(join(outputDir, "server/routes/realtime/todoChannel.js")),
    ).toBe(true);
    expect(existsSync(join(outputDir, "server/routes/realtime/index.js"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/vasp/client/realtime.js"))).toBe(
      true,
    );

    const channel = readFileSync(
      join(outputDir, "server/routes/realtime/todoChannel.js"),
      "utf8",
    );
    expect(channel).toContain("publishTodoChannel");
    expect(channel).toContain("/ws/todoChannel");
    // Room removal must not use ?.delete() — Bun's parser rejects `delete` as a keyword in optional chaining
    expect(channel).not.toContain("?.delete(ws)");
    expect(channel).toContain("oldRoomSet.delete(ws)");

    // CRUD file must import using the realtime block name (publishTodoChannel),
    // not the entity name (publishTodo)
    const crudFile = readFileSync(
      join(outputDir, "server/routes/crud/todo.js"),
      "utf8",
    );
    expect(crudFile).toContain("publishTodoChannel");
  });

  it("realtime TS: channel file emits TypeScript type annotations", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create] }
      realtime TodoChannel { entity: Todo events: [created, updated] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "realtime-ts-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const channel = readFileSync(
      join(outputDir, "server/routes/realtime/todoChannel.ts"),
      "utf8",
    );
    // TypeScript type annotations must be present
    expect(channel).toContain(": Map<string, Set<WebSocket>>");
    expect(channel).toContain("roomId: string");
    expect(channel).toContain("event: string");
    expect(channel).toContain("data: unknown");
    // Room removal must not use ?.delete() — Bun's parser rejects `delete` as a keyword in optional chaining
    expect(channel).not.toContain("?.delete(ws)");
    expect(channel).toContain("oldRoomSet.delete(ws)");
  });

  it("generates job worker and schedule endpoint", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job sendWelcomeEmail {
        executor: PgBoss
        perform: {
          fn: import { sendWelcomeEmail } from "@src/jobs.js"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/jobs/boss.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/sendWelcomeEmail.js"))).toBe(
      true,
    );
    expect(
      existsSync(
        join(outputDir, "server/routes/jobs/sendWelcomeEmailSchedule.js"),
      ),
    ).toBe(true);

    const job = readFileSync(
      join(outputDir, "server/jobs/sendWelcomeEmail.js"),
      "utf8",
    );
    expect(job).toContain("sendWelcomeEmail");
    expect(job).toContain("registerSendWelcomeEmailWorker");
    expect(job).toContain("scheduleSendWelcomeEmail");

    const schedule = readFileSync(
      join(outputDir, "server/routes/jobs/sendWelcomeEmailSchedule.js"),
      "utf8",
    );
    expect(schedule).toContain("from '../../jobs/sendWelcomeEmail.js'");

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("sendWelcomeEmailScheduleRoute");

    // Stub src/jobs.js must be generated so the server import resolves immediately
    expect(existsSync(join(outputDir, "src/jobs.js"))).toBe(true);
    const stub = readFileSync(join(outputDir, "src/jobs.js"), "utf8");
    expect(stub).toContain("export async function sendWelcomeEmail");
    expect(stub).toContain("// TODO: implement");
  });

  it("job stub: multiple jobs sharing one source file emit all exports in a single stub", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job sendTaskNotification {
        executor: PgBoss
        perform: { fn: import { sendTaskNotification } from "@src/jobs.js" }
      }
      job cleanupActivityLogs {
        executor: PgBoss
        perform: { fn: import { cleanupActivityLogs } from "@src/jobs.js" }
        schedule: "0 2 * * *"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-stub-multi");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "src/jobs.js"))).toBe(true);
    const stub = readFileSync(join(outputDir, "src/jobs.js"), "utf8");
    expect(stub).toContain("export async function sendTaskNotification");
    expect(stub).toContain("export async function cleanupActivityLogs");
  });

  it("job stub: TypeScript stub uses typed (_data: unknown) parameter", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job sendTaskNotification {
        executor: PgBoss
        perform: { fn: import { sendTaskNotification } from "@src/jobs.ts" }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-stub-ts");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "src/jobs.ts"))).toBe(true);
    const stub = readFileSync(join(outputDir, "src/jobs.ts"), "utf8");
    expect(stub).toContain(
      "export async function sendTaskNotification(_data: unknown)",
    );
  });

  it("job stub: TypeScript project with .js extension in vasp file writes stub at .ts path", () => {
    // When typescript: true and the user writes "@src/jobs.js" (common pattern),
    // the stub must be created at src/jobs.ts (matching what resolveServerImport produces)
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job sendWelcome {
        executor: PgBoss
        perform: { fn: import { sendWelcome } from "@src/jobs.js" }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-stub-ts-js-ext");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Stub must be at .ts, not .js — the server-side job worker imports @src/jobs.ts
    expect(existsSync(join(outputDir, "src/jobs.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "src/jobs.js"))).toBe(false);
    const stub = readFileSync(join(outputDir, "src/jobs.ts"), "utf8");
    expect(stub).toContain("export async function sendWelcome(_data: unknown)");
  });

  it("generates BullMQ setup file and worker with priority/retry/DLQ", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job processPayment {
        executor: BullMQ
        priority: 100
        retries: {
          limit: 5
          backoff: exponential
          delay: 2000
          multiplier: 3
        }
        deadLetter: {
          queue: "failed-payments"
        }
        perform: {
          fn: import { processPayment } from "@src/jobs.js"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-bullmq-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    // BullMQ setup file — not the PgBoss boss.js
    expect(existsSync(join(outputDir, "server/jobs/bullmq.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/boss.js"))).toBe(false);

    const worker = readFileSync(
      join(outputDir, "server/jobs/processPayment.js"),
      "utf8",
    );
    expect(worker).toContain("registerProcessPaymentWorker");
    expect(worker).toContain("scheduleProcessPayment");
    expect(worker).toContain("failed-payments"); // DLQ name
    expect(worker).toContain("exponential"); // backoff strategy
    expect(worker).toContain("RETRY_LIMIT = 5");
    expect(worker).toContain("priority: 100");
  });

  it("generates RedisStreams setup file and worker", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job syncInventory {
        executor: RedisStreams
        retries: {
          limit: 3
          backoff: fixed
          delay: 5000
        }
        deadLetter: {
          queue: "failed-inventory"
        }
        perform: {
          fn: import { syncInventory } from "@src/jobs.js"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-redis-streams-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/redis-streams.js"))).toBe(
      true,
    );
    const worker = readFileSync(
      join(outputDir, "server/jobs/syncInventory.js"),
      "utf8",
    );
    expect(worker).toContain("registerSyncInventoryWorker");
    expect(worker).toContain("scheduleSyncInventory");
    expect(worker).toContain("failed-inventory");
    expect(worker).toContain("RETRY_LIMIT = 3");
  });

  it("generates RabbitMQ setup file and worker", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job notifyPartner {
        executor: RabbitMQ
        priority: 10
        retries: {
          limit: 4
          backoff: exponential
          delay: 3000
          multiplier: 2
        }
        deadLetter: {
          queue: "failed-notifications"
        }
        perform: {
          fn: import { notifyPartner } from "@src/jobs.js"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-rabbitmq-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/rabbitmq.js"))).toBe(true);
    const worker = readFileSync(
      join(outputDir, "server/jobs/notifyPartner.js"),
      "utf8",
    );
    expect(worker).toContain("registerNotifyPartnerWorker");
    expect(worker).toContain("scheduleNotifyPartner");
    expect(worker).toContain("failed-notifications");
    expect(worker).toContain("RETRY_LIMIT = 4");
    expect(worker).toContain("PRIORITY = 10");
  });

  it("generates Kafka setup file and worker", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job indexSearchDocs {
        executor: Kafka
        retries: {
          limit: 3
          backoff: fixed
          delay: 1000
        }
        deadLetter: {
          queue: "failed-search"
        }
        perform: {
          fn: import { indexSearchDocs } from "@src/jobs.js"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-kafka-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/kafka.js"))).toBe(true);
    const worker = readFileSync(
      join(outputDir, "server/jobs/indexSearchDocs.js"),
      "utf8",
    );
    expect(worker).toContain("registerIndexSearchDocsWorker");
    expect(worker).toContain("scheduleIndexSearchDocs");
    expect(worker).toContain("failed-search");
    expect(worker).toContain("RETRY_LIMIT = 3");
  });

  it("generates only the correct executor setup files when multiple executors are used", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job jobA {
        executor: PgBoss
        perform: { fn: import { jobA } from "@src/jobs.js" }
      }
      job jobB {
        executor: BullMQ
        perform: { fn: import { jobB } from "@src/jobs.js" }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "jobs-multi-executor-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/boss.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/jobs/bullmq.js"))).toBe(true);
    // Executors not used must NOT be generated
    expect(existsSync(join(outputDir, "server/jobs/kafka.js"))).toBe(false);
    expect(existsSync(join(outputDir, "server/jobs/rabbitmq.js"))).toBe(false);
    expect(existsSync(join(outputDir, "server/jobs/redis-streams.js"))).toBe(
      false,
    );
  });

  it("generates a memory cache store file", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      cache QueryCache {
        provider: memory
        ttl: 60
      }
      query getPublicPosts {
        fn: import { getPublicPosts } from "@src/queries.js"
        cache: {
          store: QueryCache
          ttl: 300
          key: "public-posts"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "cache-memory-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    // Cache store file must be generated
    expect(existsSync(join(outputDir, "server/cache/queryCache.js"))).toBe(
      true,
    );
    const store = readFileSync(
      join(outputDir, "server/cache/queryCache.js"),
      "utf8",
    );
    expect(store).toContain("getCached");
    expect(store).toContain("setCached");
    expect(store).toContain("invalidateCached");
    expect(store).toContain("DEFAULT_TTL = 60");

    // Query route must import from the cache store and use it
    const queryRoute = readFileSync(
      join(outputDir, "server/routes/queries/getPublicPosts.js"),
      "utf8",
    );
    expect(queryRoute).toContain("from '../../cache/queryCache.js'");
    expect(queryRoute).toContain("_CACHE_KEY = 'public-posts'");
    expect(queryRoute).toContain("_CACHE_TTL = 300");
    expect(queryRoute).toContain("await getCached(_CACHE_KEY)");
    expect(queryRoute).toContain(
      "await setCached(_CACHE_KEY, result, _CACHE_TTL)",
    );
  });

  it("generates a redis cache store file", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      cache RedisCache {
        provider: redis
        ttl: 120
        redis: {
          url: env(REDIS_URL)
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "cache-redis-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const store = readFileSync(
      join(outputDir, "server/cache/redisCache.js"),
      "utf8",
    );
    expect(store).toContain("createClient");
    expect(store).toContain("process.env.REDIS_URL");
    expect(store).toContain("DEFAULT_TTL = 120");
    expect(store).toContain("getCached");
    expect(store).toContain("setCached");
    expect(store).toContain("invalidateCached");
  });

  it("generates cache invalidation calls in CRUD endpoint", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Post { id: Int @id title: String }
      cache QueryCache { provider: memory ttl: 60 }
      crud PostCrud {
        entity: Post
        operations: [list, create, update, delete]
      }
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
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "cache-invalidation-test");
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const crud = readFileSync(
      join(outputDir, "server/routes/crud/post.js"),
      "utf8",
    );
    // Cache import
    expect(crud).toContain(
      "import { invalidateCached as _invalidateQueryCache }",
    );
    expect(crud).toContain("from '../../cache/queryCache.js'");
    // Invalidation calls after create, update, delete
    expect(crud).toContain("await _invalidateQueryCache('public-posts')");
  });

  it("query without cache config generates normal query route (no cache imports)", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      query getPublicPosts {
        fn: import { getPublicPosts } from "@src/queries.js"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "query-no-cache-test");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const queryRoute = readFileSync(
      join(outputDir, "server/routes/queries/getPublicPosts.js"),
      "utf8",
    );
    expect(queryRoute).not.toContain("getCached");
    expect(queryRoute).not.toContain("setCached");
    expect(queryRoute).not.toContain("cache");
  });

  it("TypeScript CRUD: generates typed crud.ts with entity types", () => {
    const ast = parse(TS_VASP);
    const outputDir = join(TMP_DIR, "ts-crud");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/routes/crud/todo.ts"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/vasp/client/crud.ts"))).toBe(true);

    const crud = readFileSync(
      join(outputDir, "src/vasp/client/crud.ts"),
      "utf8",
    );
    expect(crud).toContain("Todo[]");
    expect(crud).toContain("Promise<Todo>");
  });

  // ── Phase 6: SSR / Nuxt 4 ──────────────────────────────────────────────

  it("SSR JS: generates nuxt.config.js, app.vue, and universal HTTP plugin", () => {
    const source = `
      app SsrApp {
        title: "SSR App"
        db: Drizzle
        ssr: true
        typescript: false
      }

      route HomeRoute {
        path: "/"
        to: HomePage
      }

      page HomePage {
        component: import Home from "@src/pages/Home.vue"
      }

      crud Todo {
        entity: Todo
        operations: [list, create]
      }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "ssr-js");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "nuxt.config.js"))).toBe(true);
    expect(existsSync(join(outputDir, "app.vue"))).toBe(true);
    // Single universal plugin replaces the old server/client split
    expect(existsSync(join(outputDir, "plugins/vasp.js"))).toBe(true);
    expect(existsSync(join(outputDir, "composables/useVasp.js"))).toBe(true);

    // app.vue must include PrimeVue global overlay components (Q6)
    const appVue = readFileSync(join(outputDir, "app.vue"), "utf8");
    expect(appVue).toContain("<Toast />");
    expect(appVue).toContain("<ConfirmDialog />");
    expect(appVue).toContain("<DynamicDialog />");

    const vaspPlugin = readFileSync(join(outputDir, "plugins/vasp.js"), "utf8");
    expect(vaspPlugin).toContain("defineNuxtPlugin");
    expect(vaspPlugin).toContain("$fetch");
    expect(vaspPlugin).toContain("/queries/");
    expect(vaspPlugin).toContain("useRequestHeaders");
  });

  it("SSR JS: generates Nuxt pages/ files from vasp routes", () => {
    const source = `
      app SsrApp {
        title: "SSR App"
        db: Drizzle
        ssr: true
        typescript: false
      }

      route HomeRoute { path: "/" to: HomePage }
      route AboutRoute { path: "/about" to: AboutPage }

      page HomePage { component: import Home from "@src/pages/Home.vue" }
      page AboutPage { component: import About from "@src/pages/About.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "ssr-pages");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "pages/index.vue"))).toBe(true);
    expect(existsSync(join(outputDir, "pages/about/index.vue"))).toBe(true);

    const indexPage = readFileSync(join(outputDir, "pages/index.vue"), "utf8");
    expect(indexPage).toContain("<Home />");
    expect(indexPage).toContain("import Home from '@src/pages/Home.vue'");
  });

  it("SSR TS: generates nuxt.config.ts with typescript: true and universal HTTP plugin", () => {
    const source = `
      app SsrTsApp {
        title: "SSR TS App"
        db: Drizzle
        ssr: true
        typescript: true
      }

      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }

      crud Todo {
        entity: Todo
        operations: [list, create]
      }

      query getTodos {
        fn: import { getTodos } from "@src/queries.ts"
        entities: [Todo]
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "ssr-ts");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "nuxt.config.ts"))).toBe(true);
    // Single universal plugin replaces the old server/client split
    expect(existsSync(join(outputDir, "plugins/vasp.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "composables/useVasp.ts"))).toBe(true);

    const nuxtConfig = readFileSync(join(outputDir, "nuxt.config.ts"), "utf8");
    expect(nuxtConfig).toContain("strict: false");

    const vaspPlugin = readFileSync(join(outputDir, "plugins/vasp.ts"), "utf8");
    expect(vaspPlugin).toContain("Promise<T>");
    expect(vaspPlugin).toContain("useRequestHeaders");
  });

  it("SSR: generates auth composable and route middleware when auth block present", () => {
    const source = `
      app SsrAuthApp {
        title: "SSR Auth App"
        db: Drizzle
        ssr: true
        typescript: false
      }

      auth UserAuth {
        userEntity: User
        methods: [usernameAndPassword]
      }

      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "ssr-auth");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "composables/useAuth.js"))).toBe(true);
    expect(existsSync(join(outputDir, "middleware/auth.js"))).toBe(true);
    expect(existsSync(join(outputDir, "pages/login.vue"))).toBe(true);
    expect(existsSync(join(outputDir, "pages/register.vue"))).toBe(true);

    const middleware = readFileSync(
      join(outputDir, "middleware/auth.js"),
      "utf8",
    );
    expect(middleware).toContain("defineNuxtRouteMiddleware");
    expect(middleware).toContain("await checkAuth()");
    expect(middleware).toContain("navigateTo('/login')");
  });

  it("SSR: server/index.js CORS origin uses SSR port (3000), not SPA port (5173)", () => {
    const source = `
      app SsrApp {
        title: "SSR App"
        db: Drizzle
        ssr: true
        typescript: false
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "ssr-cors-port");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("localhost:3000");
    expect(serverIndex).not.toContain("localhost:5173");
  });

  it("SPA: server/index.js CORS origin uses SPA port (5173)", () => {
    const source = `
      app SpaApp {
        title: "SPA App"
        db: Drizzle
        ssr: false
        typescript: false
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "spa-cors-port");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("localhost:5173");
    expect(serverIndex).not.toContain("localhost:3000");
  });

  it("TS: api route stub uses typed ctx parameter", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      api uploadImage {
        method: POST
        path: "/api/upload"
        fn: import { uploadImage } from "@src/api.ts"
        auth: false
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "api-ts-stub");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const stub = readFileSync(join(outputDir, "src/api.ts"), "utf8");
    // TypeScript stub uses typed _ctx parameter, not plain destructuring
    expect(stub).toContain("_ctx: { db: any; user?: any; args: any }");
    expect(stub).not.toContain("({ db, user, args })");
  });

  it("schema: generates FK column + Drizzle relations block for many-to-one relation", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity User { id: Int @id username: String todos: Todo[] }
      entity Todo { id: Int @id title: String author: User @onDelete(cascade) }

      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "schema-relations");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    // FK column for many-to-one
    expect(schema).toContain("authorId");
    expect(schema).toContain("references(() => users.id");
    expect(schema).toContain("onDelete: 'cascade'");
    // Drizzle relations block (stable relations API)
    expect(schema).toContain("import { relations } from 'drizzle-orm'");
    expect(schema).toContain("todosRelations = relations(todos");
    expect(schema).toContain(
      "one(users, { fields: [todos.authorId], references: [users.id] })",
    );
    expect(schema).toContain("usersRelations = relations(users");
    expect(schema).toContain("many(todos)");
    // Both entity tables generated
    expect(schema).toContain("todos =");
    expect(schema).toContain("users =");
  });

  it("schema: generates Text as text() and Json as jsonb() columns", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Post { id: Int @id body: Text @nullable metadata: Json @nullable }
      crud Post { entity: Post operations: [list, create] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "schema-types");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    expect(schema).toContain("text('body')");
    expect(schema).toContain("jsonb('metadata')");
    // @nullable means no .notNull()
    expect(schema).not.toMatch(/text\('body'\)\.notNull\(\)/);
    expect(schema).not.toMatch(/jsonb\('metadata'\)\.notNull\(\)/);
  });

  it("schema: generates @updatedAt column with .$onUpdate()", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Post { id: Int @id lastModified: DateTime @updatedAt }
      crud Post { entity: Post operations: [list] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "schema-updatedat");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const schema = readFileSync(join(outputDir, "drizzle/schema.js"), "utf8");
    expect(schema).toContain("$onUpdate(() => new Date())");
  });

  it("crud: uses db.query with `with` for entities that have relations", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String author: User @onDelete(cascade) }

      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "crud-with-relations");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/todo.js"),
      "utf8",
    );
    // Should use db.query relational API
    expect(route).toContain("db.query");
    expect(route).toContain("findMany");
    expect(route).toContain("findFirst");
    expect(route).toContain("author: true");
  });

  // ── Phase 3: End-to-End Type Safety ────────────────────────────────────

  it("TS: generates shared/types.ts with entity interfaces and input types", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity User { id: Int @id username: String @unique email: String @nullable }
      entity Todo { id: Int @id title: String done: Boolean author: User @onDelete(cascade) }

      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "shared-types");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "shared/types.ts"))).toBe(true);
    const types = readFileSync(join(outputDir, "shared/types.ts"), "utf8");

    // User interface with proper TS types
    expect(types).toContain("export interface User");
    expect(types).toContain("username: string");
    expect(types).toContain("email: string | null");
    expect(types).toContain("createdAt: Date");
    expect(types).toContain("updatedAt: Date");

    // Todo interface with relation types
    expect(types).toContain("export interface Todo");
    expect(types).toContain("title: string");
    expect(types).toContain("done: boolean");
    expect(types).toContain("author: User");
    expect(types).toContain("authorId: number");

    // Create/Update input types
    expect(types).toContain("export interface CreateUserInput");
    expect(types).toContain("export interface UpdateUserInput");
    expect(types).toContain("export interface CreateTodoInput");
    expect(types).toContain("export interface UpdateTodoInput");

    // CreateTodoInput has authorId (required FK) but not id
    expect(types).toMatch(/CreateTodoInput[\s\S]*?authorId.*: number/);
  });

  it("TS: shared/types.ts includes query/action type stubs", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }

      query getTodos {
        fn: import { getTodos } from "@src/queries.ts"
        entities: [Todo]
      }
      action createTodo {
        fn: import { createTodo } from "@src/actions.ts"
        entities: [Todo]
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "shared-types-stubs");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const types = readFileSync(join(outputDir, "shared/types.ts"), "utf8");
    expect(types).toContain("export type GetTodosArgs");
    expect(types).toContain("export type GetTodosReturn");
    expect(types).toContain("export type CreateTodoArgs");
    expect(types).toContain("export type CreateTodoReturn");
  });

  it("TS: client types.ts re-exports from @shared/types", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.ts"
        entities: [Todo]
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "client-types-reexport");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const types = readFileSync(
      join(outputDir, "src/vasp/client/types.ts"),
      "utf8",
    );
    expect(types).toContain("@shared/types.js");
    expect(types).toContain("Todo,");
    expect(types).toContain("CreateTodoInput,");
    expect(types).toContain("UpdateTodoInput,");
    expect(types).toContain("GetTodosArgs,");
    expect(types).toContain("GetTodosReturn,");
  });

  it("TS: typed crud composable uses Create/Update input types", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Recipe { id: Int @id title: String description: Text @nullable }
      crud Recipe { entity: Recipe operations: [list, create, update, delete] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "typed-crud");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const crud = readFileSync(
      join(outputDir, "src/vasp/client/crud.ts"),
      "utf8",
    );
    expect(crud).toContain("CreateRecipeInput");
    expect(crud).toContain("UpdateRecipeInput");
    // Should NOT reference the old New... type pattern
    expect(crud).not.toContain("NewRecipe");
    expect(crud).not.toContain("Partial<");
  });

  it("TS: tsconfig includes @shared path alias", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "tsconfig-shared");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const tsconfig = readFileSync(join(outputDir, "tsconfig.json"), "utf8");
    expect(tsconfig).toContain('"@shared/*"');
    expect(tsconfig).toContain('"./shared/*"');
    expect(tsconfig).toContain('"shared/**/*.ts"');
  });

  it("TS: vite.config.ts includes @shared alias", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "vite-shared");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const viteConfig = readFileSync(join(outputDir, "vite.config.ts"), "utf8");
    expect(viteConfig).toContain("'@shared'");
    expect(viteConfig).toContain("'./shared'");
  });

  it("JS SPA: vite.config.js includes @shared alias", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "vite-js-shared");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const viteConfig = readFileSync(join(outputDir, "vite.config.js"), "utf8");
    expect(viteConfig).toContain("'@shared'");
  });

  it("SSR TS: nuxt.config includes @shared alias", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: true typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "nuxt-shared");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const nuxtConfig = readFileSync(join(outputDir, "nuxt.config.ts"), "utf8");
    expect(nuxtConfig).toContain("'@shared'");
    expect(nuxtConfig).toContain("'~/shared'");
  });

  it("shared/types.ts maps field types correctly", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Post {
        id: Int @id
        title: String
        body: Text @nullable
        metadata: Json @nullable
        score: Float
        published: Boolean
        publishedAt: DateTime @nullable
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "types-mapping");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const types = readFileSync(join(outputDir, "shared/types.ts"), "utf8");
    // String → string
    expect(types).toContain("title: string");
    // Text → string
    expect(types).toContain("body: string | null");
    // Json → unknown
    expect(types).toContain("metadata: unknown | null");
    // Float → number
    expect(types).toContain("score: number");
    // Boolean → boolean
    expect(types).toContain("published: boolean");
    // DateTime → Date
    expect(types).toContain("publishedAt: Date | null");
  });

  it("TS: no shared/types.ts generated when no entities exist", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "no-entities");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "shared/types.ts"))).toBe(false);
  });

  it("JS: no shared/types.ts generated for JavaScript apps", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "js-no-types");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "shared/types.ts"))).toBe(false);
  });

  // ── Phase 4: Validation, Error UX & Testing ───────────────────────────

  it("generates shared validation schemas from entities", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String done: Boolean metadata: Json @nullable }
      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "phase4-validation-shared");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "shared/validation.ts"))).toBe(true);
    const validation = readFileSync(
      join(outputDir, "shared/validation.ts"),
      "utf8",
    );
    expect(validation).toContain("CreateTodoSchema");
    expect(validation).toContain("UpdateTodoSchema");
    expect(validation).toContain("v.object");
    expect(validation).toContain("v.partial(CreateTodoSchema)");
  });

  it("CRUD routes validate create/update payloads with Valibot", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create, update] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "phase4-crud-validation");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/todo.js"),
      "utf8",
    );
    expect(route).toContain("safeParse");
    expect(route).toContain("CreateTodoSchema");
    expect(route).toContain("UpdateTodoSchema");
    expect(route).toContain("VALIDATION_FAILED");
  });

  it("package.json includes Valibot and vitest setup", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "phase4-package");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const pkg = JSON.parse(
      readFileSync(join(outputDir, "package.json"), "utf8"),
    );
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.dependencies).not.toHaveProperty("@elysiajs/valibot");
    expect(pkg.dependencies).toHaveProperty("valibot");
    expect(pkg.devDependencies).toHaveProperty("vitest");
  });

  it("SPA generates error boundary and notifications components", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "phase4-spa-ux");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(
      existsSync(join(outputDir, "src/components/VaspErrorBoundary.vue")),
    ).toBe(true);
    expect(
      existsSync(join(outputDir, "src/components/VaspNotifications.vue")),
    ).toBe(true);
    expect(
      existsSync(join(outputDir, "src/vasp/useVaspNotifications.js")),
    ).toBe(true);

    const appVue = readFileSync(join(outputDir, "src/App.vue"), "utf8");
    expect(appVue).toContain("VaspErrorBoundary");
    expect(appVue).toContain("VaspNotifications");
  });

  it("SSR generates Nuxt error page", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: true typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "phase4-ssr-error");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "error.vue"))).toBe(true);
    const errorPage = readFileSync(join(outputDir, "error.vue"), "utf8");
    expect(errorPage).toContain("Page not found");
    expect(errorPage).toContain("Authentication required");
  });

  it("SPA client helpers wire auto-toast and loading states", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      auth U { userEntity: User methods: [usernameAndPassword] }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create, update, delete] }
      action createTodo { fn: import { createTodo } from "@src/actions.ts" entities: [Todo] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "phase4-spa-client");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const crud = readFileSync(
      join(outputDir, "src/vasp/client/crud.ts"),
      "utf8",
    );
    expect(crud).toContain("loading = ref(false)");
    expect(crud).toContain("error = ref<string | null>(null)");
    expect(crud).toContain("notifyError");
    expect(crud).toContain("safeParse");

    const actions = readFileSync(
      join(outputDir, "src/vasp/client/actions.ts"),
      "utf8",
    );
    expect(actions).toContain("notifyError");

    const auth = readFileSync(join(outputDir, "src/vasp/auth.ts"), "utf8");
    expect(auth).toContain("notifyError");
  });

  it("generates test scaffolds and Vitest config", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      auth U { userEntity: User methods: [usernameAndPassword] }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create] }
      query getTodos { fn: import { getTodos } from "@src/queries.js" entities: [Todo] }
      action createTodo { fn: import { createTodo } from "@src/actions.js" entities: [Todo] }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "phase4-test-scaffold");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "vitest.config.js"))).toBe(true);
    expect(existsSync(join(outputDir, "tests/setup.js"))).toBe(true);
    expect(existsSync(join(outputDir, "tests/crud/todo.test.js"))).toBe(true);
    expect(existsSync(join(outputDir, "tests/queries/getTodos.test.js"))).toBe(
      true,
    );
    expect(
      existsSync(join(outputDir, "tests/actions/createTodo.test.js")),
    ).toBe(true);
    expect(existsSync(join(outputDir, "tests/auth/login.test.js"))).toBe(true);
  });

  it("webhook stub: inbound webhook handler function gets a src/ stub (JS project)", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        secret: env(STRIPE_WEBHOOK_SECRET)
        verifyWith: "stripe-signature"
        fn: import { handleStripeWebhook } from "@src/webhooks/stripe.js"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-stub-js");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Route handler must exist
    expect(
      existsSync(join(outputDir, "server/routes/webhooks/stripeWebhook.js")),
    ).toBe(true);
    // User-land stub must be created so the server import resolves on first run
    expect(existsSync(join(outputDir, "src/webhooks/stripe.js"))).toBe(true);
    const stub = readFileSync(
      join(outputDir, "src/webhooks/stripe.js"),
      "utf8",
    );
    expect(stub).toContain("export async function handleStripeWebhook");
    expect(stub).toContain("// TODO: implement webhook handler");
  });

  it("webhook stub: inbound webhook handler gets a .ts stub for TypeScript projects (even with .js source)", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        secret: env(STRIPE_WEBHOOK_SECRET)
        verifyWith: "stripe-signature"
        fn: import { handleStripeWebhook } from "@src/webhooks/stripe.js"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-stub-ts");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Stub must be at .ts (matching what resolveServerImport produces), not .js
    expect(existsSync(join(outputDir, "src/webhooks/stripe.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "src/webhooks/stripe.js"))).toBe(false);
    const stub = readFileSync(
      join(outputDir, "src/webhooks/stripe.ts"),
      "utf8",
    );
    expect(stub).toContain(
      "export async function handleStripeWebhook(_body: unknown): Promise<void>",
    );
    expect(stub).toContain("// TODO: implement webhook handler");
  });

  it("webhook stub: multiple inbound webhooks sharing a source file emit all exports in one stub", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        fn: import { handleStripeWebhook } from "@src/webhooks/payments.js"
      }
      webhook GithubWebhook {
        path: "/webhooks/github"
        fn: import { handleGithubWebhook } from "@src/webhooks/payments.js"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-stub-multi");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "src/webhooks/payments.js"))).toBe(true);
    const stub = readFileSync(
      join(outputDir, "src/webhooks/payments.js"),
      "utf8",
    );
    expect(stub).toContain("export async function handleStripeWebhook");
    expect(stub).toContain("export async function handleGithubWebhook");
  });

  it("webhook stub: outbound webhooks do NOT create src/ stubs", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list] }
      webhook TodoOutbound {
        entity: Todo
        events: [created, updated]
        targets: env(WEBHOOK_URLS)
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-stub-outbound-only");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Outbound handler in server/webhooks — no src/ stub needed
    expect(existsSync(join(outputDir, "server/webhooks/todoOutbound.js"))).toBe(
      true,
    );
    // No spurious src/ stubs for outbound webhooks
    expect(existsSync(join(outputDir, "src/webhooks"))).toBe(false);
  });

  it("outbound webhook with PgBoss: dispatcher enqueues via PgBoss, worker file is emitted, server registers worker", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [create, update, delete] }
      job sendEmail {
        executor: PgBoss
        perform: {
          fn: import { sendEmail } from "@src/jobs.js"
        }
      }
      webhook TodoOutbound {
        entity: Todo
        events: [created, updated, deleted]
        targets: env(WEBHOOK_URLS)
        retry: 3
        secret: env(WEBHOOK_SECRET)
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-outbound-pgboss");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Dispatcher enqueues via PgBoss
    const dispatcher = readFileSync(
      join(outputDir, "server/webhooks/todoOutbound.js"),
      "utf8",
    );
    expect(dispatcher).toContain("import { getBoss } from '../jobs/boss.");
    expect(dispatcher).toContain("boss.send(");
    expect(dispatcher).toContain("VASP_WEBHOOK_QUEUE");
    expect(dispatcher).toContain("retryLimit: 3");
    // Should NOT contain inline fetch or in-process retry loop
    expect(dispatcher).not.toContain("_sendWithRetry");
    expect(dispatcher).not.toContain("setTimeout");

    // Shared worker file is emitted
    expect(
      existsSync(join(outputDir, "server/webhooks/webhookDispatch.js")),
    ).toBe(true);
    const worker = readFileSync(
      join(outputDir, "server/webhooks/webhookDispatch.js"),
      "utf8",
    );
    expect(worker).toContain("registerWebhookDispatchWorker");
    expect(worker).toContain("import { getBoss }");
    expect(worker).toContain("boss.work(");
    expect(worker).toContain("_deliverWebhook");

    // Server index imports and starts the worker
    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("import { registerWebhookDispatchWorker }");
    expect(serverIndex).toContain("registerWebhookDispatchWorker().catch(");
  });

  it("outbound webhook with BullMQ: dispatcher enqueues via BullMQ, worker uses BullMQ", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [create] }
      job processPayment {
        executor: BullMQ
        perform: {
          fn: import { processPayment } from "@src/jobs.js"
        }
      }
      webhook TodoOutbound {
        entity: Todo
        events: [created]
        targets: env(WEBHOOK_URLS)
        retry: 2
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-outbound-bullmq");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Dispatcher uses BullMQ queue
    const dispatcher = readFileSync(
      join(outputDir, "server/webhooks/todoOutbound.js"),
      "utf8",
    );
    expect(dispatcher).toContain("import { createQueue }");
    expect(dispatcher).toContain("_queue.add(");
    // attempts = retry + 1
    expect(dispatcher).toContain("attempts: 3");
    expect(dispatcher).not.toContain("_sendWithRetry");

    // Worker file uses BullMQ worker
    const worker = readFileSync(
      join(outputDir, "server/webhooks/webhookDispatch.js"),
      "utf8",
    );
    expect(worker).toContain("import { createQueue, createWorker }");
    expect(worker).toContain("createWorker(");
    expect(worker).not.toContain("getBoss");

    // Server registers worker at startup
    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("registerWebhookDispatchWorker");
  });

  it("outbound webhook without job system: falls back to fire-and-forget, no worker file", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [create] }
      webhook TodoOutbound {
        entity: Todo
        events: [created]
        targets: env(WEBHOOK_URLS)
        retry: 3
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-outbound-fallback");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Dispatcher uses simple fire-and-forget (no PgBoss/BullMQ import)
    const dispatcher = readFileSync(
      join(outputDir, "server/webhooks/todoOutbound.js"),
      "utf8",
    );
    expect(dispatcher).toContain("void Promise.allSettled(");
    expect(dispatcher).not.toContain("getBoss");
    expect(dispatcher).not.toContain("createQueue");
    expect(dispatcher).not.toContain("_sendWithRetry");
    expect(dispatcher).not.toContain("setTimeout");

    // No shared worker file emitted
    expect(
      existsSync(join(outputDir, "server/webhooks/webhookDispatch.js")),
    ).toBe(false);

    // Server does NOT import the worker
    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).not.toContain("registerWebhookDispatchWorker");
  });

  it("outbound webhook PgBoss takes priority over BullMQ when both are present", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [create] }
      job sendEmail {
        executor: PgBoss
        perform: {
          fn: import { sendEmail } from "@src/jobs.js"
        }
      }
      job processPayment {
        executor: BullMQ
        perform: {
          fn: import { processPayment } from "@src/jobs.js"
        }
      }
      webhook TodoOutbound {
        entity: Todo
        events: [created]
        targets: env(WEBHOOK_URLS)
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-outbound-pgboss-priority");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // PgBoss should win over BullMQ
    const dispatcher = readFileSync(
      join(outputDir, "server/webhooks/todoOutbound.js"),
      "utf8",
    );
    expect(dispatcher).toContain("getBoss");
    expect(dispatcher).not.toContain("createQueue");

    const worker = readFileSync(
      join(outputDir, "server/webhooks/webhookDispatch.js"),
      "utf8",
    );
    expect(worker).toContain("getBoss");
    expect(worker).not.toContain("createWorker");
  });

  it("webhook stub: existing src/ file is not overwritten", () => {
    const { writeFileSync } = require("node:fs");
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        fn: import { handleStripeWebhook } from "@src/webhooks/stripe.js"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "webhook-stub-preserve");
    mkdirSync(join(outputDir, "src/webhooks"), { recursive: true });
    const existingContent =
      "// existing user implementation\nexport async function handleStripeWebhook() { return 'real' }\n";
    writeFileSync(
      join(outputDir, "src/webhooks/stripe.js"),
      existingContent,
      "utf8",
    );

    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Existing file must not be overwritten
    const after = readFileSync(
      join(outputDir, "src/webhooks/stripe.js"),
      "utf8",
    );
    expect(after).toBe(existingContent);
  });

  it("preserves Enum variants in entity fields", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Post {
          id: Int @id
          status: Enum(draft, published, archived) @default("draft")
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-enum");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("status: Enum(draft, published, archived)");
    expect(mainVasp).toContain('@default("draft")');
  });

  it("preserves array relation fields (Todo[])", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity User {
          id: Int @id
          todos: Todo[]
        }
        entity Todo {
          id: Int @id
          title: String
          author: User @onDelete(cascade)
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-array");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("todos: Todo[]");
  });

  it("preserves @onDelete modifier on relation fields", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity User { id: Int @id }
        entity Todo {
          id: Int @id
          title: String
          author: User @onDelete(cascade)
          reviewer: User @onDelete(setNull) @nullable
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-ondelete");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("@onDelete(cascade)");
    expect(mainVasp).toContain("@onDelete(setNull)");
  });

  it("preserves @default(now) with closing parenthesis", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Event {
          id: Int @id
          createdAt: DateTime @default(now)
          updatedAt: DateTime @updatedAt
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-defaultnow");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("@default(now)");
    expect(mainVasp).not.toContain("@default(now\n");
    expect(mainVasp).toContain("@updatedAt");
  });

  it("emits realtime blocks in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Todo { id: Int @id title: String }
        crud Todo { entity: Todo operations: [list, create] }
        realtime TodoChannel { entity: Todo events: [created, updated, deleted] }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-realtime");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("realtime TodoChannel {");
    expect(mainVasp).toContain("entity: Todo");
    expect(mainVasp).toContain("events: [created, updated, deleted]");
  });

  it("emits job blocks (with and without schedule) in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        job sendWelcomeEmail {
          executor: PgBoss
          perform: {
            fn: import { sendWelcomeEmail } from "@src/jobs.js"
          }
        }
        job cleanup {
          executor: PgBoss
          perform: {
            fn: import { cleanup } from "@src/jobs.js"
          }
          schedule: "0 2 * * *"
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-jobs");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("job sendWelcomeEmail {");
    expect(mainVasp).toContain("executor: PgBoss");
    expect(mainVasp).toContain(
      'fn: import { sendWelcomeEmail } from "@src/jobs.js"',
    );
    expect(mainVasp).toContain("job cleanup {");
    expect(mainVasp).toContain('schedule: "0 2 * * *"');
  });

  it("emits admin block in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Todo { id: Int @id title: String }
        entity User { id: Int @id username: String }
        admin { entities: [Todo, User] }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-admin");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("admin {");
    expect(mainVasp).toContain("entities: [Todo, User]");
  });

  it("emits app.ui sub-block in main.vasp", () => {
    const source = `
        app A {
          title: "T" db: Drizzle ssr: false typescript: false
          ui: { theme: Lara primaryColor: blue darkModeSelector: ".dark" ripple: true }
        }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-ui");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("ui: {");
    expect(mainVasp).toContain("theme: Lara");
    expect(mainVasp).toContain("primaryColor: blue");
    expect(mainVasp).toContain('darkModeSelector: ".dark"');
    expect(mainVasp).toContain("ripple: true");
  });

  it("emits app.multiTenant sub-block in main.vasp", () => {
    const source = `
        app A {
          title: "T" db: Drizzle ssr: false typescript: false
          multiTenant: { strategy: "row-level" tenantEntity: Workspace tenantField: id }
        }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Workspace { id: Int @id name: String }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-multitenant");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("multiTenant: {");
    expect(mainVasp).toContain('strategy: "row-level"');
    expect(mainVasp).toContain("tenantEntity: Workspace");
    expect(mainVasp).toContain("tenantField: id");
  });

  it("emits auth permissions map in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        auth Auth {
          userEntity: User
          methods: [usernameAndPassword]
          roles: [admin, member]
          permissions: { task:create: [admin] task:read: [admin, member] }
        }
        entity User { id: Int @id email: String @unique }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-auth-permissions");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("permissions: {");
    expect(mainVasp).toContain("task:create: [ admin ]");
    expect(mainVasp).toContain("task:read: [ admin, member ]");
  });

  it("emits entity @@index and @@unique in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Post {
          id: Int @id
          title: String
          status: String
          content: Text
          @@index([title], type: fulltext)
          @@index([status])
          @@unique([title])
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-indexes");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("@@index([title], type: fulltext)");
    expect(mainVasp).toContain("@@index([status])");
    expect(mainVasp).toContain("@@unique([title])");
  });

  it("emits @manyToMany and @storage field modifiers in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Tag { id: Int @id name: String tasks: Task[] @manyToMany }
        entity Task {
          id: Int @id
          title: String
          tags: Tag[] @manyToMany
          attachment: File @storage(TaskFiles) @nullable
        }
        storage TaskFiles { provider: local }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-manytomany");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("@manyToMany");
    expect(mainVasp).toContain("@storage(TaskFiles)");
  });

  it("emits query cache config in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Post { id: Int @id title: String }
        crud Post { entity: Post operations: [list] }
        cache AppCache { provider: memory ttl: 60 }
        query getPosts {
          fn: import { getPosts } from "@src/queries.js"
          entities: [Post]
          cache: { store: AppCache ttl: 120 key: "all-posts" invalidateOn: [Post:create, Post:update] }
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-query-cache");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("cache: {");
    expect(mainVasp).toContain("store: AppCache");
    expect(mainVasp).toContain("ttl: 120");
    expect(mainVasp).toContain('key: "all-posts"');
    expect(mainVasp).toContain("invalidateOn: [Post:create, Post:update]");
  });

  it("emits crud list config, permissions, and ownership in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Task { id: Int @id title: String status: String author: String }
        auth Auth {
          userEntity: Task
          methods: [usernameAndPassword]
          roles: [admin]
          permissions: { task:read: [admin] }
        }
        crud Task {
          entity: Task
          operations: [list, create, update, delete]
          ownership: author
          list: { paginate: true sortable: [title] filterable: [status] search: [title] }
          permissions: { list: task:read }
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-crud-full");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("ownership: author");
    expect(mainVasp).toContain("list: {");
    expect(mainVasp).toContain("paginate: true");
    expect(mainVasp).toContain("sortable: [title]");
    expect(mainVasp).toContain("filterable: [status]");
    expect(mainVasp).toContain("search: [title]");
    expect(mainVasp).toContain("permissions: {");
    expect(mainVasp).toContain("list: task:read");
  });

  it("emits job priority, retries, and deadLetter in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        job sendEmail {
          executor: PgBoss
          priority: 5
          retries: { limit: 3 backoff: exponential delay: 1000 multiplier: 2 }
          deadLetter: { queue: "failed-emails" }
          perform: { fn: import { sendEmail } from "@src/jobs.js" }
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-job-full");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("priority: 5");
    expect(mainVasp).toContain("retries: {");
    expect(mainVasp).toContain("limit: 3");
    expect(mainVasp).toContain("backoff: exponential");
    expect(mainVasp).toContain("delay: 1000");
    expect(mainVasp).toContain("multiplier: 2");
    expect(mainVasp).toContain("deadLetter: {");
    expect(mainVasp).toContain('queue: "failed-emails"');
  });

  it("emits webhook blocks (inbound and outbound) in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Todo { id: Int @id title: String }
        crud Todo { entity: Todo operations: [list] }
        webhook StripeWebhook {
          path: "/webhooks/stripe"
          secret: env(STRIPE_SECRET)
          verifyWith: "stripe-signature"
          fn: import { handleStripe } from "@src/webhooks/stripe.js"
        }
        webhook TodoOutbound {
          entity: Todo
          events: [created, updated]
          targets: env(WEBHOOK_URLS)
          retry: 3
          secret: env(WEBHOOK_SECRET)
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-webhooks");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("webhook StripeWebhook {");
    expect(mainVasp).toContain('path: "/webhooks/stripe"');
    expect(mainVasp).toContain("secret: env(STRIPE_SECRET)");
    expect(mainVasp).toContain('verifyWith: "stripe-signature"');
    expect(mainVasp).toContain("fn: import { handleStripe }");
    expect(mainVasp).toContain("webhook TodoOutbound {");
    expect(mainVasp).toContain("entity: Todo");
    expect(mainVasp).toContain("events: [created, updated]");
    expect(mainVasp).toContain("targets: env(WEBHOOK_URLS)");
    expect(mainVasp).toContain("retry: 3");
  });

  it("emits storage and cache blocks in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        storage AvatarStorage {
          provider: s3
          bucket: "my-avatars"
          maxSize: "5mb"
          allowedTypes: ["image/jpeg", "image/png"]
          publicPath: "/uploads"
        }
        cache RedisCache {
          provider: redis
          ttl: 300
          redis: { url: env(REDIS_URL) }
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-storage-cache");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("storage AvatarStorage {");
    expect(mainVasp).toContain("provider: s3");
    expect(mainVasp).toContain('bucket: "my-avatars"');
    expect(mainVasp).toContain('maxSize: "5mb"');
    expect(mainVasp).toContain('"image/jpeg"');
    expect(mainVasp).toContain('publicPath: "/uploads"');
    expect(mainVasp).toContain("cache RedisCache {");
    expect(mainVasp).toContain("provider: redis");
    expect(mainVasp).toContain("ttl: 300");
    expect(mainVasp).toContain("url: env(REDIS_URL)");
  });

  it("emits observability block in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        observability {
          tracing: true
          metrics: true
          logs: structured
          exporter: otlp
          errorTracking: sentry
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-observability");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("observability {");
    expect(mainVasp).toContain("tracing: true");
    expect(mainVasp).toContain("metrics: true");
    expect(mainVasp).toContain("logs: structured");
    expect(mainVasp).toContain("exporter: otlp");
    expect(mainVasp).toContain("errorTracking: sentry");
  });

  it("emits autoPage blocks in main.vasp", () => {
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Todo { id: Int @id title: String status: String done: Boolean content: Text @nullable createdAt: DateTime @default(now) updatedAt: DateTime @updatedAt }
        action createTodo { fn: import { createTodo } from "@src/actions.js" entities: [Todo] }
        autoPage TodoList {
          entity: Todo
          path: "/todos"
          type: list
          title: "Todo List"
          columns: [id, title, status]
          sortable: [title]
          filterable: [status]
          searchable: [title]
          rowActions: [view, edit, delete]
          topActions: [create]
          paginate: true
          pageSize: 20
        }
        autoPage CreateTodo {
          entity: Todo
          path: "/todos/create"
          type: form
          title: "Create Todo"
          fields: [title, content, status, done]
          layout: "2-column"
          submitAction: createTodo
          successRoute: "/todos"
          auth: true
        }
        autoPage TodoDetail {
          entity: Todo
          path: "/todos/:id"
          type: detail
          title: "Todo Detail"
          fields: [id, title, status, done, createdAt, updatedAt]
        }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-autopages");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const mainVasp = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(mainVasp).toContain("autoPage TodoList {");
    expect(mainVasp).toContain("type: list");
    expect(mainVasp).toContain('title: "Todo List"');
    expect(mainVasp).toContain("columns: [id, title, status]");
    expect(mainVasp).toContain("rowActions: [view, edit, delete]");
    expect(mainVasp).toContain("topActions: [create]");
    expect(mainVasp).toContain("paginate: true");
    expect(mainVasp).toContain("pageSize: 20");
    expect(mainVasp).toContain("autoPage CreateTodo {");
    expect(mainVasp).toContain("type: form");
    expect(mainVasp).toContain('layout: "2-column"');
    expect(mainVasp).toContain("submitAction: createTodo");
    expect(mainVasp).toContain('successRoute: "/todos"');
    expect(mainVasp).toContain("auth: true");
    expect(mainVasp).toContain("autoPage TodoDetail {");
    expect(mainVasp).toContain("type: detail");
  });

  it("does NOT overwrite main.vasp when it already exists (vasp generate protection)", () => {
    const { writeFileSync } = require("node:fs");
    const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
      `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "main-vasp-protected");
    mkdirSync(outputDir, { recursive: true });

    // Pre-write a sentinel main.vasp simulating an existing user project
    const sentinel = "// sentinel — must not be overwritten";
    writeFileSync(join(outputDir, "main.vasp"), sentinel, "utf8");

    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const afterGenerate = readFileSync(join(outputDir, "main.vasp"), "utf8");
    expect(afterGenerate).toBe(sentinel);
  });

  // ── Stale mode-switching file cleanup ────────────────────────────────────────

  it("re-generating as SSR removes stale vite.config.js left from a prior SPA scaffold", () => {
    const { writeFileSync } = require("node:fs");
    const spaSource = `
      app SpaApp { title: "SPA" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `;
    const ssrSource = `
      app SsrApp { title: "SSR" db: Drizzle ssr: true typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/Home.vue" }
    `;
    const outputDir = join(TMP_DIR, "stale-vite-cleanup");
    mkdirSync(outputDir, { recursive: true });

    // First generate as SPA — produces vite.config.js + index.html
    generate(parse(spaSource), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "vite.config.js"))).toBe(true);
    expect(existsSync(join(outputDir, "index.html"))).toBe(true);

    // Re-generate as SSR — stale SPA files must be removed
    generate(parse(ssrSource), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "vite.config.js"))).toBe(false);
    expect(existsSync(join(outputDir, "index.html"))).toBe(false);
    expect(existsSync(join(outputDir, "nuxt.config.js"))).toBe(true);
  });

  it("re-generating as SPA removes stale nuxt.config.ts left from a prior SSR scaffold", () => {
    const { writeFileSync } = require("node:fs");
    const ssrSource = `
      app SsrApp2 { title: "SSR2" db: Drizzle ssr: true typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/Home.vue" }
    `;
    const spaSource = `
      app SpaApp2 { title: "SPA2" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/Home.vue" }
    `;
    const outputDir = join(TMP_DIR, "stale-nuxt-cleanup");
    mkdirSync(outputDir, { recursive: true });

    // First generate as SSR — produces nuxt.config.ts
    generate(parse(ssrSource), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "nuxt.config.ts"))).toBe(true);

    // Re-generate as SPA — stale nuxt.config.ts must be removed
    generate(parse(spaSource), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "nuxt.config.ts"))).toBe(false);
    expect(existsSync(join(outputDir, "vite.config.ts"))).toBe(true);
  });

  it("collects per-generator errors and continues running subsequent generators", () => {
    // Make EmailGenerator throw so we can confirm that FrontendGenerator (which
    // runs after it) still executes and that both errors end up in the result.
    const emailSpy = vi
      .spyOn(EmailGeneratorModule.EmailGenerator.prototype, "run")
      .mockImplementationOnce(() => {
        throw new Error("simulated email failure");
      });
    const frontendSpy = vi.spyOn(
      FrontendGeneratorModule.FrontendGenerator.prototype,
      "run",
    );

    try {
      const outputDir = join(TMP_DIR, "per-generator-errors");
      const ast = parse(MINIMAL_VASP);
      const result = generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        engine: sharedEngine,
      });

      // Pipeline must not abort — FrontendGenerator (step 18) must have been called.
      expect(frontendSpy).toHaveBeenCalledOnce();

      // Result must reflect the failure.
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("EmailGenerator");
      expect(result.errors[0]).toContain("simulated email failure");

      // Real output dir must remain untouched — no partial files committed.
      expect(existsSync(join(outputDir, "server/index.js"))).toBe(false);
    } finally {
      emailSpy.mockRestore();
      frontendSpy.mockRestore();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Incremental generation tests (generator dependency graph + skip-unchanged)
// ────────────────────────────────────────────────────────────────────────────

describe("incremental generation — generator dependency graph", () => {
  const BASE_SOURCE = `
    app A { title: "T" db: Drizzle ssr: false typescript: false }
    route R { path: "/" to: P }
    page P { component: import P from "@src/P.vue" }
    entity Todo { title: String }
    query getTodos { fn: import { getTodos } from "@src/queries.js" entities: [Todo] }
    action createTodo { fn: import { createTodo } from "@src/actions.js" entities: [Todo] }
    crud Todo { entity: Todo operations: [list, create, update, delete] }
  `;

  it("first run stores an astSnapshot in the manifest", () => {
    const outputDir = join(TMP_DIR, "incremental-snapshot");
    generate(parse(BASE_SOURCE), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const m = Manifest.load(outputDir);
    expect(m).not.toBeNull();
    const snap = m!.getAstSnapshot();
    expect(snap).toBeDefined();
    expect(typeof snap!["entities"]).toBe("string");
    expect(typeof snap!["queries"]).toBe("string");
    expect(typeof snap!["app"]).toBe("string");
  });

  it("second run with identical AST writes zero new files (all generators skipped)", () => {
    const outputDir = join(TMP_DIR, "incremental-no-change");
    // First run — full generation
    generate(parse(BASE_SOURCE), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Second run — same AST
    const result2 = generate(parse(BASE_SOURCE), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result2.success).toBe(true);
    // No generators ran, so nothing was written in this pass
    expect(result2.filesWritten).toHaveLength(0);
  });

  it("second run with changed queries runs QueryActionGenerator but not DrizzleSchemaGenerator", () => {
    const outputDir = join(TMP_DIR, "incremental-query-change");
    // First run
    generate(parse(BASE_SOURCE), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Second run: add a new query (queries block changed, entities unchanged)
    const source2 =
      BASE_SOURCE +
      `
      query getById { fn: import { getById } from "@src/queries.js" entities: [Todo] }
    `;
    const result2 = generate(parse(source2), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result2.success).toBe(true);
    // The new query route was generated
    expect(result2.filesWritten.some((f) => f.includes("getById"))).toBe(true);
    // DrizzleSchemaGenerator was NOT run (entities unchanged)
    expect(result2.filesWritten.some((f) => f.includes("schema"))).toBe(false);
  });

  it("second run with changed entities runs DrizzleSchemaGenerator but not QueryActionGenerator (when queries unchanged)", () => {
    const baseNoQuery = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/P.vue" }
      entity Todo { title: String }
      crud Todo { entity: Todo operations: [list] }
    `;
    const outputDir = join(TMP_DIR, "incremental-entity-change");
    // First run
    generate(parse(baseNoQuery), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Second run: add a field (entities block changed, queries block unchanged / absent)
    const source2 = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/P.vue" }
      entity Todo { title: String done: Boolean }
      crud Todo { entity: Todo operations: [list] }
    `;
    const result2 = generate(parse(source2), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result2.success).toBe(true);
    // DrizzleSchemaGenerator regenerated the schema
    expect(result2.filesWritten.some((f) => f.includes("schema"))).toBe(true);
    // QueryActionGenerator was NOT run (no queries in either AST)
    expect(result2.filesWritten.some((f) => f.includes("routes/queries"))).toBe(
      false,
    );
  });

  it("skipped generators' files remain on disk and in the manifest after incremental run", () => {
    const outputDir = join(TMP_DIR, "incremental-files-preserved");
    // First run — full generation (includes schema)
    generate(parse(BASE_SOURCE), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Second run — change only queries (schema generator skipped)
    const source2 =
      BASE_SOURCE +
      `
      query getById { fn: import { getById } from "@src/queries.js" entities: [Todo] }
    `;
    generate(parse(source2), {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    // Schema file must still exist (not orphaned / deleted)
    expect(existsSync(join(outputDir, "drizzle/schema.js"))).toBe(true);
    // New manifest must still track the schema file
    const m = Manifest.load(outputDir);
    expect(m!.hasFile("drizzle/schema.js")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// detectDestructiveSchemaChanges unit tests
// ────────────────────────────────────────────────────────────────────────────

const makeAst = (
  entities: {
    name: string;
    fields: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      isRelation?: boolean;
      isArray?: boolean;
      isManyToMany?: boolean;
    }>;
  }[],
) =>
  parse(
    [
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }`,
      `route R { path: "/" to: P }`,
      `page P { component: import P from "@src/P.vue" }`,
      ...entities.map((e) => {
        const fields = e.fields.map((f) => {
          const nullable = f.nullable ? " @nullable" : "";
          return `  ${f.name}: ${f.type}${nullable}`;
        });
        return `entity ${e.name} {\n${fields.join("\n")}\n}`;
      }),
    ].join("\n\n"),
  );

describe("detectDestructiveSchemaChanges", () => {
  it("returns no warnings when there is no previous snapshot", () => {
    const ast = makeAst([
      { name: "Todo", fields: [{ name: "title", type: "String" }] },
    ]);
    // no previous snapshot → nothing to compare
    expect(detectDestructiveSchemaChanges({ entities: {} }, ast)).toEqual([]);
  });

  it("returns no warnings when schema is unchanged", () => {
    const previousSnapshot = {
      entities: {
        Todo: { fields: { title: { type: "String", nullable: false } } },
      },
    };
    const ast = makeAst([
      { name: "Todo", fields: [{ name: "title", type: "String" }] },
    ]);
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("warns when an entity is removed", () => {
    const previousSnapshot = {
      entities: {
        OldEntity: { fields: { name: { type: "String", nullable: false } } },
      },
    };
    const ast = makeAst([]); // OldEntity gone
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("OldEntity");
    expect(warnings[0]).toContain("DROP");
  });

  it("warns when a column is removed from an entity", () => {
    const previousSnapshot = {
      entities: {
        Todo: {
          fields: {
            title: { type: "String", nullable: false },
            description: { type: "Text", nullable: true },
          },
        },
      },
    };
    const ast = makeAst([
      { name: "Todo", fields: [{ name: "title", type: "String" }] },
    ]);
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("description");
    expect(warnings[0]).toContain("Todo");
    expect(warnings[0]).toContain("DROP");
  });

  it("warns when a column type changes", () => {
    const previousSnapshot = {
      entities: {
        Product: { fields: { price: { type: "Int", nullable: false } } },
      },
    };
    const ast = makeAst([
      { name: "Product", fields: [{ name: "price", type: "Float" }] },
    ]);
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("price");
    expect(warnings[0]).toContain("Int");
    expect(warnings[0]).toContain("Float");
  });

  it("warns for renamed field (detected as drop + add)", () => {
    const previousSnapshot = {
      entities: {
        User: { fields: { username: { type: "String", nullable: false } } },
      },
    };
    // 'username' replaced by 'name' → looks like a drop to the snapshot
    const ast = makeAst([
      { name: "User", fields: [{ name: "name", type: "String" }] },
    ]);
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("username");
    expect(warnings[0]).toContain("DROP");
  });

  it("does not warn when a new column is added (additive, not destructive)", () => {
    const previousSnapshot = {
      entities: {
        Todo: { fields: { title: { type: "String", nullable: false } } },
      },
    };
    const ast = makeAst([
      {
        name: "Todo",
        fields: [
          { name: "title", type: "String" },
          { name: "done", type: "Boolean" },
        ],
      },
    ]);
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("emits multiple warnings when multiple destructive changes occur", () => {
    const previousSnapshot = {
      entities: {
        Post: {
          fields: {
            title: { type: "String", nullable: false },
            body: { type: "Text", nullable: false },
          },
        },
        Comment: { fields: { text: { type: "String", nullable: false } } },
      },
    };
    // Post.body dropped, Comment entity dropped
    const ast = makeAst([
      { name: "Post", fields: [{ name: "title", type: "String" }] },
    ]);
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => w.includes("Comment"))).toBe(true);
    expect(warnings.some((w) => w.includes("body"))).toBe(true);
  });

  it("schema snapshot is stored in manifest after a successful generate() call", () => {
    const outputDir = join(TMP_DIR, "snapshot-stored");
    const vaspSource = `
      app SnapApp { title: "Snap" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/P.vue" }
      entity Todo {
        title: String
        done: Boolean
      }
    `;
    const ast = parse(vaspSource);
    const result = generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(result.success).toBe(true);

    const loaded = Manifest.load(outputDir);
    expect(loaded).not.toBeNull();
    const snap = loaded!.getSchemaSnapshot();
    expect(snap).toBeDefined();
    expect(snap!.entities["Todo"]).toBeDefined();
    expect(snap!.entities["Todo"]!.fields["title"]).toEqual({
      type: "String",
      nullable: false,
    });
    expect(snap!.entities["Todo"]!.fields["done"]).toEqual({
      type: "Boolean",
      nullable: false,
    });
  });

  it("warns when a column changes from nullable to NOT NULL", () => {
    const previousSnapshot = {
      entities: {
        Post: { fields: { body: { type: "Text", nullable: true } } },
      },
    };
    // body is no longer @nullable in the new AST
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Post {
  body: Text
}`,
    );
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Post.body");
    expect(warnings[0]).toContain("NOT NULL");
    expect(warnings[0]).toContain("Backfill");
  });

  it("does not warn when a column stays nullable", () => {
    const previousSnapshot = {
      entities: {
        Post: { fields: { body: { type: "Text", nullable: true } } },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Post {
  body: Text @nullable
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("does not warn when a column changes from NOT NULL to nullable (additive)", () => {
    const previousSnapshot = {
      entities: {
        Post: { fields: { body: { type: "Text", nullable: false } } },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Post {
  body: Text @nullable
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("warns when a field gains a UNIQUE constraint", () => {
    const previousSnapshot = {
      entities: {
        User: {
          fields: { email: { type: "String", nullable: false, unique: false } },
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity User {
  email: String @unique
}`,
    );
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("User.email");
    expect(warnings[0]).toContain("UNIQUE");
    expect(warnings[0]).toContain("duplicate");
  });

  it("does not warn when @unique is unchanged", () => {
    const previousSnapshot = {
      entities: {
        User: {
          fields: { email: { type: "String", nullable: false, unique: true } },
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity User {
  email: String @unique
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("warns for each removed enum value", () => {
    const previousSnapshot = {
      entities: {
        Task: {
          fields: {
            status: {
              type: "Enum",
              nullable: false,
              enumValues: ["active", "inactive", "archived"],
            },
          },
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Task {
  status: Enum(active, inactive)
}`,
    );
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("archived");
    expect(warnings[0]).toContain("Task.status");
    expect(warnings[0]).toContain("Migrate");
  });

  it("warns for multiple removed enum values independently", () => {
    const previousSnapshot = {
      entities: {
        Task: {
          fields: {
            status: {
              type: "Enum",
              nullable: false,
              enumValues: ["active", "inactive", "archived"],
            },
          },
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Task {
  status: Enum(active)
}`,
    );
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes("inactive"))).toBe(true);
    expect(warnings.some((w) => w.includes("archived"))).toBe(true);
  });

  it("does not warn when enum values are unchanged", () => {
    const previousSnapshot = {
      entities: {
        Task: {
          fields: {
            status: {
              type: "Enum",
              nullable: false,
              enumValues: ["active", "inactive"],
            },
          },
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Task {
  status: Enum(active, inactive)
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("does not warn when enum values are only added (additive)", () => {
    const previousSnapshot = {
      entities: {
        Task: {
          fields: {
            status: {
              type: "Enum",
              nullable: false,
              enumValues: ["active"],
            },
          },
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Task {
  status: Enum(active, inactive)
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("warns when a new composite UNIQUE constraint is added to an existing table", () => {
    const previousSnapshot = {
      entities: {
        Membership: {
          fields: {
            userId: { type: "Int", nullable: false },
            teamId: { type: "Int", nullable: false },
          },
          // no uniqueConstraints in previous snapshot
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Membership {
  userId: Int
  teamId: Int
  @@unique([userId, teamId])
}`,
    );
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Membership");
    expect(warnings[0]).toContain("UNIQUE");
    expect(warnings[0]).toContain("duplicate");
  });

  it("does not warn when a composite UNIQUE constraint is unchanged", () => {
    const previousSnapshot = {
      entities: {
        Membership: {
          fields: {
            userId: { type: "Int", nullable: false },
            teamId: { type: "Int", nullable: false },
          },
          uniqueConstraints: [["teamId", "userId"]], // sorted
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Membership {
  userId: Int
  teamId: Int
  @@unique([userId, teamId])
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("warns when an index type changes between btree and fulltext", () => {
    const previousSnapshot = {
      entities: {
        Article: {
          fields: { title: { type: "String", nullable: false } },
          indexes: [{ fields: ["title"] }], // default btree
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Article {
  title: String
  @@index([title], type: fulltext)
}`,
    );
    const warnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Article");
    expect(warnings[0]).toContain("title");
    expect(warnings[0]).toContain("btree");
    expect(warnings[0]).toContain("fulltext");
  });

  it("does not warn when an index type is unchanged", () => {
    const previousSnapshot = {
      entities: {
        Article: {
          fields: { title: { type: "String", nullable: false } },
          indexes: [{ fields: ["title"], type: "fulltext" }],
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Article {
  title: String
  @@index([title], type: fulltext)
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("does not warn when a new index is added (additive)", () => {
    const previousSnapshot = {
      entities: {
        Article: {
          fields: { title: { type: "String", nullable: false } },
          // no indexes in previous snapshot
        },
      },
    };
    const ast = parse(
      `app TestApp { title: "T" db: Drizzle ssr: false typescript: false }
route R { path: "/" to: P }
page P { component: import P from "@src/P.vue" }
entity Article {
  title: String
  @@index([title])
}`,
    );
    expect(detectDestructiveSchemaChanges(previousSnapshot, ast)).toEqual([]);
  });

  it("warnings are returned in generate() result when destructive changes are detected", () => {
    const baseDir = join(TMP_DIR, "destructive-warning");
    const vaspV1 = `
      app DWApp { title: "DW" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/P.vue" }
      entity Item {
        name: String
        quantity: Int
      }
    `;
    const vaspV2 = `
      app DWApp { title: "DW" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/P.vue" }
      entity Item {
        label: String
      }
    `;

    // First generation — establish the snapshot
    const r1 = generate(parse(vaspV1), {
      outputDir: baseDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(r1.success).toBe(true);
    expect(r1.warnings).toEqual([]);

    // Second generation with destructive changes
    const r2 = generate(parse(vaspV2), {
      outputDir: baseDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(r2.success).toBe(true);
    // Should warn about 'name' being dropped and 'quantity' being dropped
    expect(r2.warnings.length).toBeGreaterThanOrEqual(2);
    expect(r2.warnings.some((w) => w.includes("name"))).toBe(true);
    expect(r2.warnings.some((w) => w.includes("quantity"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Plugin system
  // -------------------------------------------------------------------------

  describe("plugin system", () => {
    it("runs plugin generators after the built-in pipeline", () => {
      const ast = parse(MINIMAL_VASP);
      const outputDir = join(TMP_DIR, "plugin-generator");

      const result = generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        plugins: [
          {
            name: "test-plugin",
            generators: [
              {
                name: "HelloGenerator",
                run(_ctx, write) {
                  write("src/hello.txt", "hello from plugin");
                },
              },
            ],
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.filesWritten).toContain("src/hello.txt");
      expect(readFileSync(join(outputDir, "src/hello.txt"), "utf8")).toBe(
        "hello from plugin",
      );
    });

    it("exposes correct ctx flags to plugin generators", () => {
      const ast = parse(MINIMAL_VASP);
      const outputDir = join(TMP_DIR, "plugin-ctx");

      let capturedCtx: Record<string, unknown> = {};

      generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        plugins: [
          {
            name: "ctx-spy",
            generators: [
              {
                name: "CtxSpy",
                run(ctx, write) {
                  capturedCtx = {
                    isTypeScript: ctx.isTypeScript,
                    isSpa: ctx.isSpa,
                    isSsr: ctx.isSsr,
                    isSsg: ctx.isSsg,
                    ext: ctx.ext,
                  };
                  write("src/.ctx-spy", JSON.stringify(capturedCtx));
                },
              },
            ],
          },
        ],
      });

      // MINIMAL_VASP is a JavaScript SPA (typescript: false, ssr: false)
      expect(capturedCtx.isTypeScript).toBe(false);
      expect(capturedCtx.isSpa).toBe(true);
      expect(capturedCtx.isSsr).toBe(false);
      expect(capturedCtx.isSsg).toBe(false);
      expect(capturedCtx.ext).toBe("js");
    });

    it("applies template overrides so the override takes precedence over built-in", () => {
      const ast = parse(MINIMAL_VASP);
      const outputDir = join(TMP_DIR, "plugin-override");

      // Override the shared README template with a custom string.
      // A fresh engine is created per call (no engine: option) to avoid
      // contaminating the shared engine used by other tests.
      const result = generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        plugins: [
          {
            name: "override-plugin",
            templateOverrides: {
              "shared/README.md.hbs": "# OVERRIDDEN by plugin\n",
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const readme = readFileSync(join(outputDir, "README.md"), "utf8");
      expect(readme).toBe("# OVERRIDDEN by plugin\n");
    });

    it("registers custom Handlebars helpers that are usable in template overrides", () => {
      const ast = parse(MINIMAL_VASP);
      const outputDir = join(TMP_DIR, "plugin-helper");

      const result = generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        plugins: [
          {
            name: "helper-plugin",
            helpers: {
              shout: (str: unknown) => String(str).toUpperCase() + "!!!",
            },
            templateOverrides: {
              "shared/README.md.hbs": "# {{shout appName}}\n",
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const readme = readFileSync(join(outputDir, "README.md"), "utf8");
      // appName comes from the app block; MINIMAL_VASP defines "app MinimalApp"
      expect(readme).toContain("MINIMALAPP!!!");
    });

    it("collects errors from plugin generators without aborting the pipeline", () => {
      const ast = parse(MINIMAL_VASP);
      const outputDir = join(TMP_DIR, "plugin-error");

      const result = generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        plugins: [
          {
            name: "bad-plugin",
            generators: [
              {
                name: "ThrowingGenerator",
                run() {
                  throw new Error("plugin generator crashed");
                },
              },
            ],
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("plugin generator crashed");
    });

    it("rejects path-traversal attempts from plugin generators", () => {
      const ast = parse(MINIMAL_VASP);
      const outputDir = join(TMP_DIR, "plugin-traversal");

      const result = generate(ast, {
        outputDir,
        templateDir: TEMPLATES_DIR,
        logLevel: "silent",
        plugins: [
          {
            name: "evil-plugin",
            generators: [
              {
                name: "TraversalGenerator",
                run(_ctx, write) {
                  write("../../etc/passwd", "hacked");
                },
              },
            ],
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(
        result.errors.some((e) => e.includes("outside the output directory")),
      ).toBe(true);
    });
  });
});
