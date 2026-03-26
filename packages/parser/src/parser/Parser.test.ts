import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "./Parser.js";

const FIXTURES_DIR = join(import.meta.dirname, "../../../../e2e/fixtures");

describe("Parser — minimal app", () => {
  it("parses app block", () => {
    const ast = parse(`
      app MinimalApp {
        title: "Hello Vasp"
        db: Drizzle
        ssr: false
        typescript: false
      }
    `);
    expect(ast.app).toMatchObject({
      type: "App",
      name: "MinimalApp",
      title: "Hello Vasp",
      db: "Drizzle",
      ssr: false,
      typescript: false,
    });
  });

  it("parses ssr: true", () => {
    const ast = parse(
      `app A { title: "T" db: Drizzle ssr: true typescript: false }`,
    );
    expect(ast.app.ssr).toBe(true);
  });

  it('parses ssr: "ssg"', () => {
    const ast = parse(
      `app A { title: "T" db: Drizzle ssr: "ssg" typescript: false }`,
    );
    expect(ast.app.ssr).toBe("ssg");
  });

  it("parses typescript: true", () => {
    const ast = parse(
      `app A { title: "T" db: Drizzle ssr: false typescript: true }`,
    );
    expect(ast.app.typescript).toBe(true);
  });

  it("parses app env schema", () => {
    const ast = parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required
          GOOGLE_CLIENT_ID: optional
        }
      }
    `);

    expect(ast.app.env).toEqual({
      DATABASE_URL: "required",
      GOOGLE_CLIENT_ID: "optional",
    });
  });

  it("throws on invalid app env requirement", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: mandatory
        }
      }
    `),
    ).toThrow("E038_INVALID_ENV_REQUIREMENT");
  });

  it("throws on duplicate app env keys", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required
          DATABASE_URL: optional
        }
      }
    `),
    ).toThrow("E039_DUPLICATE_ENV_KEY");
  });
});

describe("Parser — auth block", () => {
  it("parses auth with all methods", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword, google, github ]
      }
    `);
    expect(ast.auth).toMatchObject({
      type: "Auth",
      name: "User",
      userEntity: "User",
      methods: ["usernameAndPassword", "google", "github"],
    });
  });

  it("parses auth roles", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword ]
        roles: [ admin, editor, viewer ]
      }
    `);
    expect(ast.auth).toMatchObject({
      roles: ["admin", "editor", "viewer"],
    });
  });
});

describe("Parser — entity block", () => {
  it("parses entity with fields and modifiers", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo {
        id: Int @id
        title: String
        done: Boolean
        createdAt: DateTime @default(now)
      }
    `);
    expect(ast.entities).toHaveLength(1);
    expect(ast.entities[0]).toMatchObject({
      type: "Entity",
      name: "Todo",
      fields: [
        { name: "id", type: "Int", modifiers: ["id"] },
        { name: "title", type: "String", modifiers: [] },
        { name: "done", type: "Boolean", modifiers: [] },
        { name: "createdAt", type: "DateTime", modifiers: ["default_now"] },
      ],
    });
  });

  it("parses entity with unique modifier", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User {
        id: Int @id
        email: String @unique
      }
    `);
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: "email",
      type: "String",
      modifiers: ["unique"],
    });
  });

  it("parses multiple entities", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id title: String }
      entity User { id: Int @id email: String @unique }
    `);
    expect(ast.entities).toHaveLength(2);
    expect(ast.entities[0]?.name).toBe("Todo");
    expect(ast.entities[1]?.name).toBe("User");
  });

  it("treats capitalised field types as relation references (no parser throw)", () => {
    // Unknown capitalized names (e.g. Uuid) are treated as relation entity references.
    // Semantic validation (E115) catches undefined relation entities — not the parser.
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Uuid @id }
    `);
    const idField = ast.entities[0]?.fields[0];
    expect(idField?.type).toBe("Uuid");
    expect(idField?.isRelation).toBe(true);
  });

  it("parses entity with Float field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Product { id: Int @id price: Float }
    `);
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: "price",
      type: "Float",
      modifiers: [],
    });
  });
});

describe("Parser — route and page", () => {
  it("parses route and page", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `);
    expect(ast.routes[0]).toMatchObject({
      type: "Route",
      name: "HomeRoute",
      path: "/",
      to: "HomePage",
    });
    expect(ast.pages[0]).toMatchObject({
      type: "Page",
      name: "HomePage",
      component: {
        kind: "default",
        defaultExport: "Home",
        source: "@src/pages/Home.vue",
      },
    });
  });
});

describe("Parser — query and action", () => {
  it("parses query with named import", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `);
    expect(ast.queries[0]).toMatchObject({
      type: "Query",
      name: "getTodos",
      fn: { kind: "named", namedExport: "getTodos", source: "@src/queries.js" },
      entities: ["Todo"],
      auth: false,
    });
  });

  it("parses action", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [create] }
      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Todo]
      }
    `);
    expect(ast.actions[0]).toMatchObject({
      type: "Action",
      name: "createTodo",
      fn: {
        kind: "named",
        namedExport: "createTodo",
        source: "@src/actions.js",
      },
    });
  });

  it("parses roles on query/action", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list, create] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
        auth: true
        roles: [admin, editor]
      }

      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Todo]
        auth: true
        roles: [admin]
      }
    `);

    expect(ast.queries[0]?.roles).toEqual(["admin", "editor"]);
    expect(ast.actions[0]?.roles).toEqual(["admin"]);
  });
});

describe("Parser — api", () => {
  it("parses api with method/path/fn/auth", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api uploadRecipeImage {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadRecipeImage } from "@src/api.js"
        auth: true
      }
    `);

    expect(ast.apis).toHaveLength(1);
    expect(ast.apis?.[0]).toMatchObject({
      type: "Api",
      name: "uploadRecipeImage",
      method: "POST",
      path: "/api/recipes/:id/image",
      auth: true,
      fn: {
        kind: "named",
        namedExport: "uploadRecipeImage",
        source: "@src/api.js",
      },
    });
  });

  it("parses api roles", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api uploadRecipeImage {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadRecipeImage } from "@src/api.js"
        auth: true
        roles: [admin]
      }
    `);

    expect(ast.apis?.[0]?.roles).toEqual(["admin"]);
  });
});

describe("Parser — middleware", () => {
  it("parses middleware with fn and scope", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      middleware Logger {
        fn: import logger from "@src/middleware/logger.js"
        scope: global
      }
    `);

    expect(ast.middlewares).toHaveLength(1);
    expect(ast.middlewares?.[0]).toMatchObject({
      type: "Middleware",
      name: "Logger",
      scope: "global",
      fn: {
        kind: "default",
        defaultExport: "logger",
        source: "@src/middleware/logger.js",
      },
    });
  });
});

describe("Parser — crud", () => {
  it("parses crud with all operations", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo {
        entity: Todo
        operations: [list, create, update, delete]
      }
    `);
    expect(ast.cruds[0]).toMatchObject({
      type: "Crud",
      name: "Todo",
      entity: "Todo",
      operations: ["list", "create", "update", "delete"],
    });
  });

  it("parses crud with full list config (paginate, sortable, filterable, search)", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [list, create, update, delete]
        list: {
          paginate: true
          sortable: [createdAt, priority, title]
          filterable: [status, assigneeId]
          search: [title, description]
        }
      }
    `);
    expect(ast.cruds[0]).toMatchObject({
      type: "Crud",
      name: "Task",
      entity: "Task",
      operations: ["list", "create", "update", "delete"],
      listConfig: {
        paginate: true,
        sortable: ["createdAt", "priority", "title"],
        filterable: ["status", "assigneeId"],
        search: ["title", "description"],
      },
    });
  });

  it("parses crud with list config paginate: false and empty arrays", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo {
        entity: Todo
        operations: [list]
        list: {
          paginate: false
          sortable: [createdAt]
          filterable: []
          search: []
        }
      }
    `);
    expect(ast.cruds[0].listConfig).toMatchObject({
      paginate: false,
      sortable: ["createdAt"],
      filterable: [],
      search: [],
    });
  });

  it("parses crud without list config — listConfig is undefined", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
    `);
    expect(ast.cruds[0].listConfig).toBeUndefined();
  });

  it("rejects unknown list sub-block property", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo {
        entity: Todo
        operations: [list]
        list: { unknown: true }
      }
    `),
    ).toThrow("E021_UNKNOWN_PROP");
  });
});

describe("Parser — realtime", () => {
  it("parses realtime block", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel {
        entity: Todo
        events: [created, updated, deleted]
      }
    `);
    expect(ast.realtimes[0]).toMatchObject({
      type: "Realtime",
      name: "TodoChannel",
      entity: "Todo",
      events: ["created", "updated", "deleted"],
    });
  });
});

describe("Parser — job", () => {
  it("parses job with nested perform block", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      job sendWelcomeEmail {
        executor: PgBoss
        perform: {
          fn: import { sendWelcomeEmail } from "@src/jobs.js"
        }
      }
    `);
    expect(ast.jobs[0]).toMatchObject({
      type: "Job",
      name: "sendWelcomeEmail",
      executor: "PgBoss",
      perform: {
        fn: {
          kind: "named",
          namedExport: "sendWelcomeEmail",
          source: "@src/jobs.js",
        },
      },
    });
  });
});

describe("Parser — seed", () => {
  it("parses seed block", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      seed {
        fn: import seedData from "@src/seed.js"
      }
    `);

    expect(ast.seed).toMatchObject({
      type: "Seed",
      fn: {
        kind: "default",
        defaultExport: "seedData",
        source: "@src/seed.js",
      },
    });
  });
});

describe("Parser — error cases", () => {
  it("throws on unknown top-level token", () => {
    expect(() => parse("unknown Foo {}")).toThrow("E010_UNEXPECTED_TOKEN");
  });

  it("throws when api fn is missing", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api Upload {
        method: POST
        path: "/api/upload"
      }
    `),
    ).toThrow("E034_MISSING_FN");
  });

  it("throws when middleware fn is missing", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      middleware Logger { scope: global }
    `),
    ).toThrow("E037_MISSING_FN");
  });

  it("throws when seed fn is missing", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      seed {}
    `),
    ).toThrow("E042_MISSING_FN");
  });

  it("throws on duplicate seed blocks", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      seed { fn: import seedData from "@src/seed.js" }
      seed { fn: import otherSeed from "@src/seed2.js" }
    `),
    ).toThrow("E040_DUPLICATE_SEED_BLOCK");
  });

  it("throws on duplicate app blocks (E043)", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      app B { title: "T2" db: Drizzle ssr: false typescript: false }
    `),
    ).toThrow("E043_DUPLICATE_APP_BLOCK");
  });

  it("throws on duplicate auth blocks (E044)", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth UserAuth { userEntity: User methods: [usernameAndPassword] }
      auth AdminAuth { userEntity: User methods: [usernameAndPassword] }
    `),
    ).toThrow("E044_DUPLICATE_AUTH_BLOCK");
  });

  it("throws on empty Enum variants (E141, not E116)", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id status: Enum() }
    `),
    ).toThrow("E141_EMPTY_ENUM");
  });

  it("throws on duplicate elements in an identifier array (E045)", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list, create, list] }
    `),
    ).toThrow("E045_DUPLICATE_ARRAY_ELEMENT");
  });

  it("throws on duplicate auth methods (E045)", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth UserAuth { userEntity: User methods: [usernameAndPassword, usernameAndPassword] }
    `),
    ).toThrow("E045_DUPLICATE_ARRAY_ELEMENT");
  });

  it("throws on empty app title (E046)", () => {
    expect(() =>
      parse(`
      app A { title: "" db: Drizzle ssr: false typescript: false }
    `),
    ).toThrow("E046_EMPTY_APP_TITLE");
  });

  it("throws when api path does not start with slash (E047)", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api Upload {
        method: POST
        path: "api/upload"
        fn: import { upload } from "@src/api.js"
      }
    `),
    ).toThrow("E047_INVALID_API_PATH");
  });

  it("passes when api path starts with slash", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api Upload {
        method: POST
        path: "/api/upload"
        fn: import { upload } from "@src/api.js"
      }
    `),
    ).not.toThrow();
  });

  it("throws on missing component in page", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      page HomePage {}
    `),
    ).toThrow("E016_MISSING_COMPONENT");
  });

  it("throws on missing fn in query", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      query getTodos { entities: [Todo] }
    `),
    ).toThrow("E018_MISSING_FN");
  });

  it("preserves line numbers in errors", () => {
    try {
      parse("$bad");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("line 1");
    }
  });
});

describe("Parser — relation fields (Phase 2)", () => {
  it("parses a many-to-one relation field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User }
    `);
    const authorField = ast.entities[1]?.fields[1];
    expect(authorField).toMatchObject({
      name: "author",
      type: "User",
      isRelation: true,
      relatedEntity: "User",
      isArray: false,
      nullable: false,
    });
  });

  it("parses a one-to-many virtual array relation field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id todos: Todo[] }
      entity Todo { id: Int @id }
    `);
    const todosField = ast.entities[0]?.fields[1];
    expect(todosField).toMatchObject({
      name: "todos",
      type: "Todo",
      isRelation: true,
      relatedEntity: "Todo",
      isArray: true,
    });
  });

  it("parses @onDelete(cascade) modifier on a relation field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User @onDelete(cascade) }
    `);
    const authorField = ast.entities[1]?.fields[1];
    expect(authorField).toMatchObject({
      name: "author",
      isRelation: true,
      onDelete: "cascade",
    });
  });

  it("parses @onDelete(setNull) modifier", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User @onDelete(setNull) }
    `);
    expect(ast.entities[1]?.fields[1]?.onDelete).toBe("set null");
  });
});

describe("Parser — new field types and modifiers (Phase 2)", () => {
  it("parses Text field type", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id body: Text }
    `);
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: "body",
      type: "Text",
      isRelation: false,
    });
  });

  it("parses Json field type", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id metadata: Json }
    `);
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: "metadata",
      type: "Json",
      isRelation: false,
    });
  });

  it("parses @nullable modifier", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id body: Text @nullable }
    `);
    const bodyField = ast.entities[0]?.fields[1];
    expect(bodyField?.nullable).toBe(true);
    expect(bodyField?.modifiers).toContain("nullable");
  });

  it("parses @updatedAt modifier", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id updatedAt: DateTime @updatedAt }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.isUpdatedAt).toBe(true);
    expect(field?.modifiers).toContain("updatedAt");
  });

  it("parses @default(now) modifier", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id createdAt: DateTime @default(now) }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.defaultValue).toBe("now");
    expect(field?.modifiers).toContain("default_now");
  });

  it("parses @default with a string value", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id status: String @default("draft") }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.defaultValue).toBe("draft");
  });
});

describe("Parser — snapshot: full-featured fixture", () => {
  it("matches snapshot", () => {
    const source = readFileSync(
      join(FIXTURES_DIR, "full-featured.vasp"),
      "utf8",
    );
    const ast = parse(source, "full-featured.vasp");
    // Remove loc data for cleaner snapshot comparison
    const clean = JSON.parse(
      JSON.stringify(ast, (key, val) => (key === "loc" ? undefined : val)),
    );
    expect(clean).toMatchSnapshot();
  });
});

describe("Parser — snapshot: minimal fixture", () => {
  it("matches snapshot", () => {
    const source = readFileSync(join(FIXTURES_DIR, "minimal.vasp"), "utf8");
    const ast = parse(source, "minimal.vasp");
    const clean = JSON.parse(
      JSON.stringify(ast, (key, val) => (key === "loc" ? undefined : val)),
    );
    expect(clean).toMatchSnapshot();
  });
});

describe("Parser — admin block", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("parses admin block with entities list", () => {
    const ast = parse(`
      ${APP}
      entity Todo { id: Int @id title: String }
      entity User { id: Int @id username: String }
      admin {
        entities: [Todo, User]
      }
    `);
    expect(ast.admin).toMatchObject({
      type: "Admin",
      entities: ["Todo", "User"],
    });
  });

  it("parses admin block with a single entity", () => {
    const ast = parse(`
      ${APP}
      entity Todo { id: Int @id title: String }
      admin {
        entities: [Todo]
      }
    `);
    expect(ast.admin).toBeDefined();
    expect(ast.admin!.entities).toEqual(["Todo"]);
  });

  it("admin is undefined when no admin block is present", () => {
    const ast = parse(`${APP}`);
    expect(ast.admin).toBeUndefined();
  });

  it("throws on duplicate admin blocks (E046)", () => {
    expect(() =>
      parse(`
      ${APP}
      entity Todo { id: Int @id title: String }
      admin { entities: [Todo] }
      admin { entities: [Todo] }
    `),
    ).toThrow("E046_DUPLICATE_ADMIN_BLOCK");
  });

  it("throws on unknown admin property", () => {
    expect(() =>
      parse(`
      ${APP}
      admin { unknown: foo }
    `),
    ).toThrow("E047_UNKNOWN_PROP");
  });
});

describe("Parser — @validate modifier (field-level validation)", () => {
  it("parses @validate(email) on a String field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id email: String @validate(email) }
    `);
    const emailField = ast.entities[0]?.fields[1];
    expect(emailField?.validation).toEqual({ email: true });
  });

  it("parses @validate(url) on a String field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id website: String @validate(url) }
    `);
    expect(ast.entities[0]?.fields[1]?.validation).toEqual({ url: true });
  });

  it("parses @validate(uuid) on a String field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id externalId: String @validate(uuid) }
    `);
    expect(ast.entities[0]?.fields[1]?.validation).toEqual({ uuid: true });
  });

  it("parses @validate(minLength: 3, maxLength: 30) on a String field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id username: String @validate(minLength: 3, maxLength: 30) }
    `);
    expect(ast.entities[0]?.fields[1]?.validation).toEqual({
      minLength: 3,
      maxLength: 30,
    });
  });

  it("parses @validate(min: 0, max: 100) on an Int field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Product { id: Int @id stock: Int @validate(min: 0, max: 100) }
    `);
    expect(ast.entities[0]?.fields[1]?.validation).toEqual({
      min: 0,
      max: 100,
    });
  });

  it("parses combined @validate(email, minLength: 5) on a String field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id email: String @validate(email, minLength: 5) }
    `);
    expect(ast.entities[0]?.fields[1]?.validation).toEqual({
      email: true,
      minLength: 5,
    });
  });

  it("leaves validation undefined when @validate is absent", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id title: String }
    `);
    expect(ast.entities[0]?.fields[1]?.validation).toBeUndefined();
  });

  it("parses @validate together with other modifiers", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id username: String @unique @validate(minLength: 3) }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.modifiers).toContain("unique");
    expect(field?.validation).toEqual({ minLength: 3 });
  });
});

describe("Parser — storage block", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("parses a local storage block with all properties", () => {
    const ast = parse(`
      ${APP}
      storage Files {
        provider: local
        maxSize: "10mb"
        allowedTypes: ["image/*", "application/pdf"]
        publicPath: "/uploads"
      }
    `);
    expect(ast.storages).toHaveLength(1);
    expect(ast.storages![0]).toMatchObject({
      type: "Storage",
      name: "Files",
      provider: "local",
      maxSize: "10mb",
      allowedTypes: ["image/*", "application/pdf"],
      publicPath: "/uploads",
    });
  });

  it("parses a minimal storage block with only provider", () => {
    const ast = parse(`
      ${APP}
      storage Docs {
        provider: local
      }
    `);
    expect(ast.storages).toHaveLength(1);
    expect(ast.storages![0]?.name).toBe("Docs");
    expect(ast.storages![0]?.provider).toBe("local");
    expect(ast.storages![0]?.bucket).toBeUndefined();
  });

  it("parses an s3 storage block with bucket", () => {
    const ast = parse(`
      ${APP}
      storage Assets {
        provider: s3
        bucket: "my-assets-bucket"
        maxSize: "50mb"
        allowedTypes: ["image/*"]
        publicPath: "/media"
      }
    `);
    expect(ast.storages![0]).toMatchObject({
      type: "Storage",
      name: "Assets",
      provider: "s3",
      bucket: "my-assets-bucket",
    });
  });

  it("parses multiple storage blocks", () => {
    const ast = parse(`
      ${APP}
      storage Images {
        provider: local
        publicPath: "/images"
      }
      storage Docs {
        provider: s3
        bucket: "docs-bucket"
      }
    `);
    expect(ast.storages).toHaveLength(2);
    expect(ast.storages![0]?.name).toBe("Images");
    expect(ast.storages![1]?.name).toBe("Docs");
  });

  it("storages is undefined when no storage block is present", () => {
    const ast = parse(`${APP}`);
    expect(ast.storages).toBeUndefined();
  });

  it("throws on missing provider (E056)", () => {
    expect(() =>
      parse(`
      ${APP}
      storage Files {
        maxSize: "10mb"
      }
    `),
    ).toThrow("E056_MISSING_STORAGE_PROVIDER");
  });

  it("throws on unknown storage property (E055)", () => {
    expect(() =>
      parse(`
      ${APP}
      storage Files {
        provider: local
        unknown: foo
      }
    `),
    ).toThrow("E055_UNKNOWN_PROP");
  });

  it("parses File field type with @storage() modifier", () => {
    const ast = parse(`
      ${APP}
      storage Files {
        provider: local
      }
      entity Post {
        id: Int @id
        title: String
        coverImage: File @storage(Files)
      }
    `);
    const field = ast.entities[0]?.fields.find((f) => f.name === "coverImage");
    expect(field).toBeDefined();
    expect(field?.type).toBe("File");
    expect(field?.storageBlock).toBe("Files");
  });

  it("parses File field type without @storage() modifier", () => {
    const ast = parse(`
      ${APP}
      entity Post {
        id: Int @id
        attachment: File
      }
    `);
    const field = ast.entities[0]?.fields.find((f) => f.name === "attachment");
    expect(field?.type).toBe("File");
    expect(field?.storageBlock).toBeUndefined();
  });
});

describe("SemanticValidator — storage blocks", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("throws on duplicate storage block names (E160)", () => {
    expect(() =>
      parse(`
      ${APP}
      storage Files {
        provider: local
      }
      storage Files {
        provider: s3
        bucket: "my-bucket"
      }
    `),
    ).toThrow("E160_DUPLICATE_STORAGE");
  });

  it("throws on unknown storage provider (E161)", () => {
    expect(() =>
      parse(`
      ${APP}
      storage Files {
        provider: ftp
      }
    `),
    ).toThrow("E161_UNKNOWN_STORAGE_PROVIDER");
  });

  it("throws when cloud provider has no bucket (E162)", () => {
    expect(() =>
      parse(`
      ${APP}
      storage Assets {
        provider: s3
      }
    `),
    ).toThrow("E162_STORAGE_REQUIRES_BUCKET");
  });

  it("throws when @storage() references undeclared storage block (E163)", () => {
    expect(() =>
      parse(`
      ${APP}
      entity Post {
        id: Int @id
        photo: File @storage(Nonexistent)
      }
    `),
    ).toThrow("E163_UNKNOWN_STORAGE_REF");
  });

  it("accepts a valid File field referencing a declared storage block", () => {
    expect(() =>
      parse(`
      ${APP}
      storage Files {
        provider: local
      }
      entity Post {
        id: Int @id
        photo: File @storage(Files)
      }
    `),
    ).not.toThrow();
  });
});
