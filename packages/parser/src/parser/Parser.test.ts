import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "./Parser.js";
import { parse as parseWithValidation } from "../index.js";

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

  it("parses app env schema with types and validators", () => {
    const ast = parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required String
          GOOGLE_CLIENT_ID: optional String
          JWT_SECRET: required String @minLength(32)
          STRIPE_KEY: required String @startsWith("sk_")
          MAX_SIZE: optional Int @default(1024)
          NODE_ENV: required Enum(development, production)
          FEATURE_FLAG: optional Boolean @default(false)
        }
      }
    `);

    expect(ast.app.env).toEqual({
      DATABASE_URL: { requirement: "required", type: "String" },
      GOOGLE_CLIENT_ID: { requirement: "optional", type: "String" },
      JWT_SECRET: {
        requirement: "required",
        type: "String",
        validation: { minLength: 32 },
      },
      STRIPE_KEY: {
        requirement: "required",
        type: "String",
        validation: { startsWith: "sk_" },
      },
      MAX_SIZE: { requirement: "optional", type: "Int", defaultValue: "1024" },
      NODE_ENV: {
        requirement: "required",
        type: "Enum",
        enumValues: ["development", "production"],
      },
      FEATURE_FLAG: {
        requirement: "optional",
        type: "Boolean",
        defaultValue: "false",
      },
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
          DATABASE_URL: mandatory String
        }
      }
    `),
    ).toThrow("E038_INVALID_ENV_REQUIREMENT");
  });

  it("throws on invalid app env type", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required URL
        }
      }
    `),
    ).toThrow("E040_INVALID_ENV_TYPE");
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
          DATABASE_URL: required String
          DATABASE_URL: optional String
        }
      }
    `),
    ).toThrow("E039_DUPLICATE_ENV_KEY");
  });

  it("throws on duplicate env enum variants", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          NODE_ENV: required Enum(dev, dev)
        }
      }
    `),
    ).toThrow("E041_DUPLICATE_ENV_ENUM_VARIANT");
  });

  it("throws on empty env Enum variant list", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          NODE_ENV: required Enum()
        }
      }
    `),
    ).toThrow("E042_EMPTY_ENV_ENUM");
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

  it("parses @@index compound index on entity", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        projectId: Int
        status: Enum(todo, done)
        @@index([projectId, status])
      }
    `);
    expect(ast.entities[0]?.indexes).toEqual([
      { fields: ["projectId", "status"] },
    ]);
    expect(ast.entities[0]?.uniqueConstraints).toBeUndefined();
  });

  it("parses @@index with type: fulltext", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        title: String
        @@index([title], type: fulltext)
      }
    `);
    expect(ast.entities[0]?.indexes).toEqual([
      { fields: ["title"], type: "fulltext" },
    ]);
  });

  it("parses @@unique composite unique constraint", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        projectId: Int
        title: String
        @@unique([projectId, title])
      }
    `);
    expect(ast.entities[0]?.uniqueConstraints).toEqual([
      { fields: ["projectId", "title"] },
    ]);
    expect(ast.entities[0]?.indexes).toBeUndefined();
  });

  it("parses entity with multiple @@index and @@unique directives", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        title: String @index
        status: Enum(todo, in_progress, done) @index
        projectId: Int
        @@index([projectId, status])
        @@index([title], type: fulltext)
        @@unique([projectId, title])
      }
    `);
    const entity = ast.entities[0]!;
    expect(entity.indexes).toHaveLength(2);
    expect(entity.indexes![0]).toEqual({ fields: ["projectId", "status"] });
    expect(entity.indexes![1]).toEqual({ fields: ["title"], type: "fulltext" });
    expect(entity.uniqueConstraints).toHaveLength(1);
    expect(entity.uniqueConstraints![0]).toEqual({
      fields: ["projectId", "title"],
    });
  });

  it("throws E165 on empty @@index field list", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        entity Task { id: Int @id @@index([]) }
      `),
    ).toThrow("E165_EMPTY_INDEX_FIELDS");
  });

  it("throws E167 on unknown @@index type", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        entity Task { id: Int @id title: String @@index([title], type: hash) }
      `),
    ).toThrow("E167_UNKNOWN_INDEX_TYPE");
  });

  it("throws E168 on empty @@unique field list", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        entity Task { id: Int @id @@unique([]) }
      `),
    ).toThrow("E168_EMPTY_UNIQUE_FIELDS");
  });

  it("throws E169 on unknown table directive", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        entity Task { id: Int @id @@check([id]) }
      `),
    ).toThrow("E169_UNKNOWN_TABLE_DIRECTIVE");
  });

  it("parses field config block with label and placeholder", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo {
        id: Int @id
        title: String {
          label: "Task Title"
          placeholder: "Enter a task name…"
        }
      }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.name).toBe("title");
    expect(field?.config).toEqual({
      label: "Task Title",
      placeholder: "Enter a task name…",
    });
  });

  it("parses field config block with all properties", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        priority: Int {
          label: "Priority"
          description: "Higher is more urgent"
          default: 1
          validate: {
            required: true
            min: 1
            max: 5
          }
        }
      }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.config).toEqual({
      label: "Priority",
      description: "Higher is more urgent",
      default: 1,
      validate: {
        required: true,
        min: 1,
        max: 5,
      },
    });
  });

  it("parses field config block with string default", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        title: String {
          default: "Untitled"
        }
      }
    `);
    expect(ast.entities[0]?.fields[1]?.config?.default).toBe("Untitled");
  });

  it("parses field config block with boolean default", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Task {
        id: Int @id
        done: Boolean {
          default: false
        }
      }
    `);
    expect(ast.entities[0]?.fields[1]?.config?.default).toBe(false);
  });

  it("parses field config block with full validate sub-block", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User {
        id: Int @id
        username: String {
          validate: {
            required: true
            minLength: 3
            maxLength: 32
            pattern: "^[a-z][a-z0-9_]+$"
            custom: "@src/validators/username.js"
          }
        }
      }
    `);
    expect(ast.entities[0]?.fields[1]?.config?.validate).toEqual({
      required: true,
      minLength: 3,
      maxLength: 32,
      pattern: "^[a-z][a-z0-9_]+$",
      custom: "@src/validators/username.js",
    });
  });

  it("parses field config block alongside @modifiers", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post {
        id: Int @id
        title: String @unique {
          label: "Post Title"
        }
      }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.modifiers).toContain("unique");
    expect(field?.config?.label).toBe("Post Title");
  });

  it("fields without config block have config=undefined", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id title: String }
    `);
    expect(ast.entities[0]?.fields[0]?.config).toBeUndefined();
    expect(ast.entities[0]?.fields[1]?.config).toBeUndefined();
  });

  it("throws E172 on unknown field config property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        entity Todo { id: Int @id title: String { unknown: "x" } }
      `),
    ).toThrow("E172_UNKNOWN_FIELD_CONFIG_PROP");
  });

  it("throws E171 on unknown validate sub-property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        entity Todo { id: Int @id title: String { validate: { foo: true } } }
      `),
    ).toThrow("E171_UNKNOWN_VALIDATE_CONFIG_PROP");
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

  it("parses crud with ownership field", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Order {
        entity: Order
        operations: [list, create, update, delete]
        ownership: ownerId
      }
    `);
    expect(ast.cruds[0]).toMatchObject({
      type: "Crud",
      name: "Order",
      entity: "Order",
      operations: ["list", "create", "update", "delete"],
      ownership: "ownerId",
    });
  });

  it("parses crud without ownership — ownership is undefined", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
    `);
    expect(ast.cruds[0].ownership).toBeUndefined();
  });

  it("rejects unknown crud property", () => {
    expect(() =>
      parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo {
        entity: Todo
        operations: [list]
        unknown: field
      }
    `),
    ).toThrow("E021_UNKNOWN_PROP");
  });

  it("parses crud with columns config inside list", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [list, create, update, delete]
        list: {
          paginate: true
          sortable: [title]
          filterable: []
          search: []
          columns: {
            title { label: "Task Title", width: "40%", sortable: true }
            done  { label: "Done", hidden: false }
          }
        }
      }
    `);
    expect(ast.cruds[0]?.listConfig?.columns).toEqual({
      title: { label: "Task Title", width: "40%", sortable: true },
      done: { label: "Done", hidden: false },
    });
  });

  it("parses crud list with columns — only supplied props present", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: []
          columns: {
            status { filterable: true }
          }
        }
      }
    `);
    const col = ast.cruds[0]?.listConfig?.columns?.["status"];
    expect(col).toEqual({ filterable: true });
    expect(col?.label).toBeUndefined();
  });

  it("parses crud without columns — columns is undefined", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [list]
        list: { paginate: false sortable: [] filterable: [] search: [] }
      }
    `);
    expect(ast.cruds[0]?.listConfig?.columns).toBeUndefined();
  });

  it("throws E173 on unknown column config property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        crud Task {
          entity: Task
          operations: [list]
          list: {
            paginate: false sortable: [] filterable: [] search: []
            columns: { title { unknown: "x" } }
          }
        }
      `),
    ).toThrow("E173_UNKNOWN_COLUMN_CONFIG_PROP");
  });

  it("parses crud with form config (2-column layout with sections)", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [list, create, update, delete]
        form: {
          layout: "2-column"
          sections: {
            basics { label: "Basic Info", fields: [title, priority] }
            meta   { fields: [status, dueDate] }
          }
        }
      }
    `);
    const form = ast.cruds[0]?.formConfig;
    expect(form?.layout).toBe("2-column");
    expect(form?.sections).toEqual({
      basics: { label: "Basic Info", fields: ["title", "priority"] },
      meta: { fields: ["status", "dueDate"] },
    });
    expect(form?.steps).toBeUndefined();
  });

  it("parses crud with form config (steps layout)", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [create]
        form: {
          layout: "steps"
          steps: {
            basics { label: "Step 1", fields: [title] }
            details { label: "Step 2", fields: [description, priority] }
          }
        }
      }
    `);
    const form = ast.cruds[0]?.formConfig;
    expect(form?.layout).toBe("steps");
    expect(form?.steps?.["basics"]).toEqual({
      label: "Step 1",
      fields: ["title"],
    });
    expect(form?.steps?.["details"]).toEqual({
      label: "Step 2",
      fields: ["description", "priority"],
    });
  });

  it("parses crud with only form layout (no sections/steps)", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Task {
        entity: Task
        operations: [create, update]
        form: {
          layout: "1-column"
        }
      }
    `);
    const form = ast.cruds[0]?.formConfig;
    expect(form?.layout).toBe("1-column");
    expect(form?.sections).toBeUndefined();
    expect(form?.steps).toBeUndefined();
  });

  it("parses crud without form config — formConfig is undefined", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
    `);
    expect(ast.cruds[0]?.formConfig).toBeUndefined();
  });

  it("throws E174 on invalid form layout", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        crud Task {
          entity: Task
          operations: [create]
          form: { layout: "wizard" }
        }
      `),
    ).toThrow("E174_INVALID_FORM_LAYOUT");
  });

  it("throws E175 on unknown form config property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        crud Task {
          entity: Task
          operations: [create]
          form: { unknown: true }
        }
      `),
    ).toThrow("E175_UNKNOWN_FORM_CONFIG_PROP");
  });

  it("throws E176 on unknown section property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        crud Task {
          entity: Task
          operations: [create]
          form: {
            layout: "2-column"
            sections: { basics { unknown: "x" } }
          }
        }
      `),
    ).toThrow("E176_UNKNOWN_FORM_SECTION_PROP");
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

  it("parses BullMQ job with priority, retries and deadLetter", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
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
        schedule: "0 * * * *"
      }
    `);
    expect(ast.jobs[0]).toMatchObject({
      type: "Job",
      name: "processPayment",
      executor: "BullMQ",
      priority: 100,
      retries: {
        limit: 5,
        backoff: "exponential",
        delay: 2000,
        multiplier: 3,
      },
      deadLetter: { queue: "failed-payments" },
      schedule: "0 * * * *",
      perform: {
        fn: {
          kind: "named",
          namedExport: "processPayment",
          source: "@src/jobs.js",
        },
      },
    });
  });

  it("parses RedisStreams job with fixed backoff", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
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
    `);
    expect(ast.jobs[0]).toMatchObject({
      executor: "RedisStreams",
      retries: { limit: 3, backoff: "fixed", delay: 5000 },
      deadLetter: { queue: "failed-inventory" },
    });
    expect(ast.jobs[0].retries?.multiplier).toBeUndefined();
    expect(ast.jobs[0].priority).toBeUndefined();
  });

  it("parses RabbitMQ job", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      job notifyPartner {
        executor: RabbitMQ
        priority: 10
        perform: {
          fn: import { notifyPartner } from "@src/jobs.js"
        }
      }
    `);
    expect(ast.jobs[0].executor).toBe("RabbitMQ");
    expect(ast.jobs[0].priority).toBe(10);
  });

  it("parses Kafka job", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      job indexSearchDocs {
        executor: Kafka
        perform: {
          fn: import { indexSearchDocs } from "@src/jobs.js"
        }
      }
    `);
    expect(ast.jobs[0].executor).toBe("Kafka");
  });

  it("throws on unknown backoff strategy", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        job myJob {
          executor: BullMQ
          retries: {
            backoff: quadratic
          }
          perform: {
            fn: import { myJob } from "@src/jobs.js"
          }
        }
      `),
    ).toThrow(/E026_UNKNOWN_BACKOFF/);
  });

  it("throws on unknown retries property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        job myJob {
          executor: PgBoss
          retries: {
            maxAttempts: 3
          }
          perform: {
            fn: import { myJob } from "@src/jobs.js"
          }
        }
      `),
    ).toThrow(/E027_UNKNOWN_PROP/);
  });

  it("throws on unknown deadLetter property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        job myJob {
          executor: PgBoss
          deadLetter: {
            topic: "wrong"
          }
          perform: {
            fn: import { myJob } from "@src/jobs.js"
          }
        }
      `),
    ).toThrow(/E028_UNKNOWN_PROP/);
  });

  it("throws on unknown job property", () => {
    expect(() =>
      parse(`
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        job myJob {
          executor: PgBoss
          maxConcurrency: 5
          perform: {
            fn: import { myJob } from "@src/jobs.js"
          }
        }
      `),
    ).toThrow(/E024_UNKNOWN_PROP/);
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

  it("parses @hidden modifier", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id secretToken: String @hidden }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.isHidden).toBe(true);
    expect(field?.modifiers).toContain("hidden");
  });

  it("parses @hidden combined with other modifiers", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id internalScore: Int @nullable @hidden }
    `);
    const field = ast.entities[0]?.fields[1];
    expect(field?.isHidden).toBe(true);
    expect(field?.nullable).toBe(true);
    expect(field?.modifiers).toContain("hidden");
    expect(field?.modifiers).toContain("nullable");
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
      parseWithValidation(`
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
      parseWithValidation(`
      ${APP}
      storage Files {
        provider: ftp
      }
    `),
    ).toThrow("E161_UNKNOWN_STORAGE_PROVIDER");
  });

  it("throws when cloud provider has no bucket (E162)", () => {
    expect(() =>
      parseWithValidation(`
      ${APP}
      storage Assets {
        provider: s3
      }
    `),
    ).toThrow("E162_STORAGE_REQUIRES_BUCKET");
  });

  it("throws when @storage() references undeclared storage block (E163)", () => {
    expect(() =>
      parseWithValidation(`
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
      parseWithValidation(`
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

describe("Parser — email block", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("parses a minimal email block with provider and from", () => {
    const ast = parse(`
      ${APP}
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
      }
    `);
    expect(ast.emails).toHaveLength(1);
    expect(ast.emails![0]).toMatchObject({
      type: "Email",
      name: "Mailer",
      provider: "resend",
      from: "noreply@myapp.com",
      templates: [],
    });
  });

  it("parses email block with named-import templates", () => {
    const ast = parse(`
      ${APP}
      email Mailer {
        provider: sendgrid
        from: "hello@example.com"
        templates: {
          welcome: import { welcomeTemplate } from "@src/emails/welcome.js"
          resetPassword: import { resetTemplate } from "@src/emails/reset.js"
        }
      }
    `);
    expect(ast.emails![0]?.templates).toHaveLength(2);
    expect(ast.emails![0]?.templates[0]).toMatchObject({
      name: "welcome",
      fn: {
        kind: "named",
        namedExport: "welcomeTemplate",
        source: "@src/emails/welcome.js",
      },
    });
    expect(ast.emails![0]?.templates[1]).toMatchObject({
      name: "resetPassword",
      fn: {
        kind: "named",
        namedExport: "resetTemplate",
        source: "@src/emails/reset.js",
      },
    });
  });

  it("parses email block with default-import template", () => {
    const ast = parse(`
      ${APP}
      email Mailer {
        provider: smtp
        from: "no-reply@myapp.com"
        templates: {
          welcome: import WelcomeTpl from "@src/emails/welcome.js"
        }
      }
    `);
    expect(ast.emails![0]?.templates[0]).toMatchObject({
      name: "welcome",
      fn: {
        kind: "default",
        defaultExport: "WelcomeTpl",
        source: "@src/emails/welcome.js",
      },
    });
  });

  it("parses multiple email blocks", () => {
    const ast = parse(`
      ${APP}
      email TransactionalMailer {
        provider: resend
        from: "tx@myapp.com"
      }
      email MarketingMailer {
        provider: sendgrid
        from: "marketing@myapp.com"
      }
    `);
    expect(ast.emails).toHaveLength(2);
    expect(ast.emails![0]?.name).toBe("TransactionalMailer");
    expect(ast.emails![1]?.name).toBe("MarketingMailer");
  });

  it("emails is undefined when no email block is present", () => {
    const ast = parse(`${APP}`);
    expect(ast.emails).toBeUndefined();
  });

  it("throws on missing provider (E059)", () => {
    expect(() =>
      parse(`
      ${APP}
      email Mailer {
        from: "noreply@myapp.com"
      }
    `),
    ).toThrow("E059_MISSING_EMAIL_PROVIDER");
  });

  it("throws on missing from address (E060)", () => {
    expect(() =>
      parse(`
      ${APP}
      email Mailer {
        provider: resend
      }
    `),
    ).toThrow("E060_MISSING_EMAIL_FROM");
  });

  it("throws on unknown email property (E058)", () => {
    expect(() =>
      parse(`
      ${APP}
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
        unknown: foo
      }
    `),
    ).toThrow("E058_UNKNOWN_PROP");
  });
});

describe("Parser — action onSuccess", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("parses action with onSuccess.sendEmail", () => {
    const ast = parse(`
      ${APP}
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccess: {
          sendEmail: welcome
        }
      }
    `);
    expect(ast.actions[0]?.onSuccess).toEqual({ sendEmail: "welcome" });
  });

  it("parses action without onSuccess (field is absent)", () => {
    const ast = parse(`
      ${APP}
      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: []
      }
    `);
    expect(ast.actions[0]?.onSuccess).toBeUndefined();
  });

  it("throws on unknown onSuccess property (E057)", () => {
    expect(() =>
      parse(`
      ${APP}
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccess: {
          unknownProp: foo
        }
      }
    `),
    ).toThrow("E057_UNKNOWN_PROP");
  });

  it("throws on unknown action property when onSuccess is misspelled", () => {
    expect(() =>
      parse(`
      ${APP}
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccessTypo: {
          sendEmail: welcome
        }
      }
    `),
    ).toThrow("E019_UNKNOWN_PROP");
  });
});

describe("Parser — app multiTenant block", () => {
  it("parses multiTenant with row-level strategy", () => {
    const ast = parse(`
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
    `);
    expect(ast.app.multiTenant).toEqual({
      strategy: "row-level",
      tenantEntity: "Workspace",
      tenantField: "workspaceId",
    });
  });

  it("parses multiTenant with schema-level strategy", () => {
    const ast = parse(`
      app MySaas {
        title: "My SaaS"
        db: Drizzle
        ssr: false
        typescript: false
        multiTenant: {
          strategy: "schema-level"
          tenantEntity: Tenant
          tenantField: tenantId
        }
      }
    `);
    expect(ast.app.multiTenant).toEqual({
      strategy: "schema-level",
      tenantEntity: "Tenant",
      tenantField: "tenantId",
    });
  });

  it("multiTenant is undefined when not declared", () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
    `);
    expect(ast.app.multiTenant).toBeUndefined();
  });

  it("throws on unknown multiTenant property (E047)", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        multiTenant: {
          strategy: "row-level"
          tenantEntity: Workspace
          tenantField: workspaceId
          unknown: foo
        }
      }
    `),
    ).toThrow("E047_UNKNOWN_MULTITENANT_PROP");
  });

  it("throws on unknown app property (E012) when multiTenant is misspelled", () => {
    expect(() =>
      parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        multiTenantTypo: {
          strategy: "row-level"
          tenantEntity: Workspace
          tenantField: workspaceId
        }
      }
    `),
    ).toThrow("E012_UNKNOWN_PROP");
  });
});

const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

describe("Parser — cache block", () => {
  it("parses a memory cache block with default ttl", () => {
    const ast = parse(`
      ${APP}
      cache QueryCache {
        provider: memory
        ttl: 60
      }
    `);
    expect(ast.caches).toHaveLength(1);
    expect(ast.caches![0]).toMatchObject({
      type: "Cache",
      name: "QueryCache",
      provider: "memory",
      ttl: 60,
    });
  });

  it("parses a redis cache block with redis.url", () => {
    const ast = parse(`
      ${APP}
      cache RedisCache {
        provider: redis
        ttl: 120
        redis: {
          url: env(REDIS_URL)
        }
      }
    `);
    expect(ast.caches![0]).toMatchObject({
      type: "Cache",
      name: "RedisCache",
      provider: "redis",
      ttl: 120,
      redis: { url: "REDIS_URL" },
    });
  });

  it("parses a valkey cache block", () => {
    const ast = parse(`
      ${APP}
      cache ValkeyCache {
        provider: valkey
        redis: {
          url: env(VALKEY_URL)
        }
      }
    `);
    expect(ast.caches![0]).toMatchObject({
      type: "Cache",
      name: "ValkeyCache",
      provider: "valkey",
      redis: { url: "VALKEY_URL" },
    });
    expect(ast.caches![0]?.ttl).toBeUndefined();
  });

  it("parses multiple cache blocks", () => {
    const ast = parse(`
      ${APP}
      cache MemCache { provider: memory }
      cache RCache { provider: redis redis: { url: env(REDIS_URL) } }
    `);
    expect(ast.caches).toHaveLength(2);
    expect(ast.caches![0]?.name).toBe("MemCache");
    expect(ast.caches![1]?.name).toBe("RCache");
  });

  it("caches is undefined when no cache block is present", () => {
    const ast = parse(`${APP}`);
    expect(ast.caches).toBeUndefined();
  });

  it("throws on missing provider (E070)", () => {
    expect(() =>
      parse(`
      ${APP}
      cache QueryCache {
        ttl: 60
      }
    `),
    ).toThrow("E070_MISSING_CACHE_PROVIDER");
  });

  it("throws on unknown cache property (E071)", () => {
    expect(() =>
      parse(`
      ${APP}
      cache QueryCache {
        provider: memory
        unknown: foo
      }
    `),
    ).toThrow("E071_UNKNOWN_PROP");
  });

  it("throws on unknown redis property (E072)", () => {
    expect(() =>
      parse(`
      ${APP}
      cache RedisCache {
        provider: redis
        redis: {
          unknown: foo
        }
      }
    `),
    ).toThrow("E072_UNKNOWN_PROP");
  });

  it("throws on missing redis.url when redis block has no url (E073)", () => {
    expect(() =>
      parse(`
      ${APP}
      cache RedisCache {
        provider: redis
        redis: {
        }
      }
    `),
    ).toThrow("E073_MISSING_REDIS_URL");
  });

  it("throws when env() is not used for redis.url (E076)", () => {
    expect(() =>
      parse(`
      ${APP}
      cache RedisCache {
        provider: redis
        redis: {
          url: notEnv(REDIS_URL)
        }
      }
    `),
    ).toThrow("E076_EXPECTED_ENV_REF");
  });
});

describe("Parser — query cache config", () => {
  it("parses a query with full cache config", () => {
    const ast = parse(`
      ${APP}
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
    `);
    const query = ast.queries[0];
    expect(query?.cache).toMatchObject({
      store: "QueryCache",
      ttl: 300,
      key: "public-posts",
      invalidateOn: ["Post:create", "Post:update", "Post:delete"],
    });
  });

  it("parses a query with minimal cache config (store only)", () => {
    const ast = parse(`
      ${APP}
      cache QueryCache { provider: memory }
      query getUsers {
        fn: import { getUsers } from "@src/queries.js"
        cache: {
          store: QueryCache
        }
      }
    `);
    expect(ast.queries[0]?.cache).toMatchObject({ store: "QueryCache" });
    expect(ast.queries[0]?.cache?.ttl).toBeUndefined();
    expect(ast.queries[0]?.cache?.key).toBeUndefined();
  });

  it("parses a query without cache config", () => {
    const ast = parse(`
      ${APP}
      query getUsers {
        fn: import { getUsers } from "@src/queries.js"
      }
    `);
    expect(ast.queries[0]?.cache).toBeUndefined();
  });

  it("throws on missing cache store (E075)", () => {
    expect(() =>
      parse(`
      ${APP}
      query getUsers {
        fn: import { getUsers } from "@src/queries.js"
        cache: {
          ttl: 60
        }
      }
    `),
    ).toThrow("E075_MISSING_CACHE_STORE");
  });

  it("throws on unknown query cache property (E074)", () => {
    expect(() =>
      parse(`
      ${APP}
      query getUsers {
        fn: import { getUsers } from "@src/queries.js"
        cache: {
          store: QueryCache
          unknown: foo
        }
      }
    `),
    ).toThrow("E074_UNKNOWN_PROP");
  });

  it("parses invalidateOn with multiple entries", () => {
    const ast = parse(`
      ${APP}
      cache C { provider: memory }
      query getPosts {
        fn: import { getPosts } from "@src/queries.js"
        cache: {
          store: C
          invalidateOn: [Post:create, Comment:create, Post:delete]
        }
      }
    `);
    expect(ast.queries[0]?.cache?.invalidateOn).toEqual([
      "Post:create",
      "Comment:create",
      "Post:delete",
    ]);
  });
});

describe("Parser — webhook block", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("parses a minimal inbound webhook block", () => {
    const ast = parse(`
      ${APP}
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        fn: import { handleStripeWebhook } from "@src/webhooks/stripe.js"
      }
    `);
    expect(ast.webhooks).toHaveLength(1);
    expect(ast.webhooks![0]).toMatchObject({
      type: "Webhook",
      name: "StripeWebhook",
      mode: "inbound",
      path: "/webhooks/stripe",
      fn: {
        kind: "named",
        namedExport: "handleStripeWebhook",
        source: "@src/webhooks/stripe.js",
      },
    });
  });

  it("parses a full inbound webhook with secret and verifyWith", () => {
    const ast = parse(`
      ${APP}
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        secret: env(STRIPE_WEBHOOK_SECRET)
        verifyWith: "stripe-signature"
        fn: import { handleStripeWebhook } from "@src/webhooks/stripe.js"
      }
    `);
    expect(ast.webhooks![0]).toMatchObject({
      type: "Webhook",
      name: "StripeWebhook",
      mode: "inbound",
      path: "/webhooks/stripe",
      secret: "STRIPE_WEBHOOK_SECRET",
      verifyWith: "stripe-signature",
    });
  });

  it("parses an inbound webhook with github-signature verifyWith", () => {
    const ast = parse(`
      ${APP}
      webhook GithubWebhook {
        path: "/webhooks/github"
        secret: env(GITHUB_WEBHOOK_SECRET)
        verifyWith: "github-signature"
        fn: import { handleGithubWebhook } from "@src/webhooks/github.js"
      }
    `);
    expect(ast.webhooks![0]).toMatchObject({
      mode: "inbound",
      verifyWith: "github-signature",
    });
  });

  it("parses an inbound webhook with hmac verifyWith", () => {
    const ast = parse(`
      ${APP}
      webhook MyWebhook {
        path: "/webhooks/my"
        secret: env(MY_WEBHOOK_SECRET)
        verifyWith: "hmac"
        fn: import { handleMyWebhook } from "@src/webhooks/my.js"
      }
    `);
    expect(ast.webhooks![0]).toMatchObject({
      mode: "inbound",
      verifyWith: "hmac",
    });
  });

  it("parses a minimal outbound webhook block", () => {
    const ast = parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook TaskWebhook {
        entity: Task
        events: [created, updated, deleted]
        targets: env(WEBHOOK_URLS)
      }
    `);
    expect(ast.webhooks).toHaveLength(1);
    expect(ast.webhooks![0]).toMatchObject({
      type: "Webhook",
      name: "TaskWebhook",
      mode: "outbound",
      entity: "Task",
      events: ["created", "updated", "deleted"],
      targets: "WEBHOOK_URLS",
    });
    expect(ast.webhooks![0]?.retry).toBeUndefined();
  });

  it("parses a full outbound webhook with secret and retry", () => {
    const ast = parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook TaskWebhook {
        entity: Task
        events: [created, updated, deleted]
        targets: env(WEBHOOK_URLS)
        retry: 3
        secret: env(WEBHOOK_SECRET)
      }
    `);
    expect(ast.webhooks![0]).toMatchObject({
      mode: "outbound",
      retry: 3,
      secret: "WEBHOOK_SECRET",
    });
  });

  it("parses outbound webhook with subset of events", () => {
    const ast = parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook TaskCreatedWebhook {
        entity: Task
        events: [created]
        targets: env(WEBHOOK_URLS)
      }
    `);
    expect(ast.webhooks![0]?.events).toEqual(["created"]);
  });

  it("parses multiple webhook blocks", () => {
    const ast = parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook StripeWebhook {
        path: "/webhooks/stripe"
        fn: import { handleStripe } from "@src/webhooks/stripe.js"
      }
      webhook TaskWebhook {
        entity: Task
        events: [created]
        targets: env(WEBHOOK_URLS)
      }
    `);
    expect(ast.webhooks).toHaveLength(2);
    expect(ast.webhooks![0]?.name).toBe("StripeWebhook");
    expect(ast.webhooks![1]?.name).toBe("TaskWebhook");
  });

  it("webhooks is undefined when no webhook block is present", () => {
    const ast = parse(`${APP}`);
    expect(ast.webhooks).toBeUndefined();
  });

  it("throws when neither fn nor entity is provided (E081)", () => {
    expect(() =>
      parse(`
      ${APP}
      webhook MyWebhook {
        path: "/webhooks/my"
        secret: env(MY_SECRET)
      }
    `),
    ).toThrow("E081_MISSING_WEBHOOK_MODE");
  });

  it("throws when both fn and entity are provided (E082)", () => {
    expect(() =>
      parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook Ambiguous {
        path: "/webhooks/ambiguous"
        fn: import { handler } from "@src/webhooks/handler.js"
        entity: Task
        events: [created]
        targets: env(WEBHOOK_URLS)
      }
    `),
    ).toThrow("E082_AMBIGUOUS_WEBHOOK_MODE");
  });

  it("throws on missing path for inbound webhook (E083)", () => {
    expect(() =>
      parse(`
      ${APP}
      webhook MissingPath {
        fn: import { handler } from "@src/webhooks/handler.js"
      }
    `),
    ).toThrow("E083_INBOUND_WEBHOOK_MISSING_PATH");
  });

  it("throws on missing events for outbound webhook (E084)", () => {
    expect(() =>
      parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook MissingEvents {
        entity: Task
        targets: env(WEBHOOK_URLS)
      }
    `),
    ).toThrow("E084_OUTBOUND_WEBHOOK_MISSING_EVENTS");
  });

  it("throws on missing targets for outbound webhook (E085)", () => {
    expect(() =>
      parse(`
      ${APP}
      entity Task { id: Int @id title: String }
      webhook MissingTargets {
        entity: Task
        events: [created]
      }
    `),
    ).toThrow("E085_OUTBOUND_WEBHOOK_MISSING_TARGETS");
  });

  it("throws on unknown property (E080)", () => {
    expect(() =>
      parse(`
      ${APP}
      webhook Bad {
        path: "/webhooks/bad"
        fn: import { handler } from "@src/webhooks/handler.js"
        unknownProp: foo
      }
    `),
    ).toThrow("E080_UNKNOWN_WEBHOOK_PROP");
  });
});

describe("Parser — observability block", () => {
  it("parses a minimal observability block with defaults", () => {
    const ast = parse(`
      ${APP}
      observability {
      }
    `);
    expect(ast.observability).toMatchObject({
      type: "Observability",
      tracing: false,
      metrics: false,
      logs: "console",
      exporter: "console",
      errorTracking: "none",
    });
  });

  it("parses a full observability block", () => {
    const ast = parse(`
      ${APP}
      observability {
        tracing: true
        metrics: true
        logs: structured
        exporter: otlp
        errorTracking: sentry
      }
    `);
    expect(ast.observability).toMatchObject({
      type: "Observability",
      tracing: true,
      metrics: true,
      logs: "structured",
      exporter: "otlp",
      errorTracking: "sentry",
    });
  });

  it("parses observability with prometheus exporter and datadog error tracking", () => {
    const ast = parse(`
      ${APP}
      observability {
        metrics: true
        exporter: prometheus
        errorTracking: datadog
      }
    `);
    expect(ast.observability).toMatchObject({
      exporter: "prometheus",
      errorTracking: "datadog",
      metrics: true,
    });
  });

  it("observability is undefined when no observability block is present", () => {
    const ast = parse(`${APP}`);
    expect(ast.observability).toBeUndefined();
  });

  it("throws on duplicate observability blocks (E090)", () => {
    expect(() =>
      parse(`
      ${APP}
      observability { }
      observability { }
    `),
    ).toThrow("E090_DUPLICATE_OBSERVABILITY_BLOCK");
  });

  it("throws on invalid logs mode (E091)", () => {
    expect(() =>
      parse(`
      ${APP}
      observability {
        logs: json
      }
    `),
    ).toThrow("E091_INVALID_OBSERVABILITY_LOGS_MODE");
  });

  it("throws on invalid exporter (E092)", () => {
    expect(() =>
      parse(`
      ${APP}
      observability {
        exporter: jaeger
      }
    `),
    ).toThrow("E092_INVALID_OBSERVABILITY_EXPORTER");
  });

  it("throws on invalid errorTracking provider (E093)", () => {
    expect(() =>
      parse(`
      ${APP}
      observability {
        errorTracking: newrelic
      }
    `),
    ).toThrow("E093_INVALID_ERROR_TRACKING_PROVIDER");
  });

  it("throws on unknown property (E094)", () => {
    expect(() =>
      parse(`
      ${APP}
      observability {
        unknownProp: true
      }
    `),
    ).toThrow("E094_UNKNOWN_OBSERVABILITY_PROP");
  });
});

// ─── autoPage block ───────────────────────────────────────────────────────────

describe("Parser — autoPage block", () => {
  const APP = `app A { title: "T" db: Drizzle ssr: false typescript: false }`;

  it("parses a list autoPage with all properties", () => {
    const ast = parse(`
      ${APP}
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
        title: "All Todos"
        columns: [id, title, done]
        sortable: [title]
        filterable: [done]
        searchable: [title]
        rowActions: [view, edit, delete]
        topActions: [create, export]
        paginate: true
        pageSize: 25
      }
    `);
    expect(ast.autoPages).toHaveLength(1);
    const ap = ast.autoPages![0]!;
    expect(ap.type).toBe("AutoPage");
    expect(ap.name).toBe("TodoList");
    expect(ap.entity).toBe("Todo");
    expect(ap.path).toBe("/todos");
    expect(ap.pageType).toBe("list");
    expect(ap.title).toBe("All Todos");
    expect(ap.columns).toEqual(["id", "title", "done"]);
    expect(ap.sortable).toEqual(["title"]);
    expect(ap.filterable).toEqual(["done"]);
    expect(ap.searchable).toEqual(["title"]);
    expect(ap.rowActions).toEqual(["view", "edit", "delete"]);
    expect(ap.topActions).toEqual(["create", "export"]);
    expect(ap.paginate).toBe(true);
    expect(ap.pageSize).toBe(25);
  });

  it("parses a form autoPage", () => {
    const ast = parse(`
      ${APP}
      autoPage CreateTodo {
        entity: Todo
        path: "/todos/create"
        type: form
        title: "Create Todo"
        fields: [title, done]
        layout: "2-column"
        submitAction: createTodo
        successRoute: "/todos"
      }
    `);
    const ap = ast.autoPages![0]!;
    expect(ap.pageType).toBe("form");
    expect(ap.fields).toEqual(["title", "done"]);
    expect(ap.layout).toBe("2-column");
    expect(ap.submitAction).toBe("createTodo");
    expect(ap.successRoute).toBe("/todos");
  });

  it("parses a detail autoPage", () => {
    const ast = parse(`
      ${APP}
      autoPage TodoDetail {
        entity: Todo
        path: "/todos/:id"
        type: detail
        fields: [id, title, done]
      }
    `);
    const ap = ast.autoPages![0]!;
    expect(ap.pageType).toBe("detail");
    expect(ap.fields).toEqual(["id", "title", "done"]);
    expect(ap.title).toBeUndefined();
  });

  it("parses auth and roles on an autoPage", () => {
    const ast = parse(`
      ${APP}
      autoPage AdminTodos {
        entity: Todo
        path: "/admin/todos"
        type: list
        auth: true
        roles: [admin, moderator]
      }
    `);
    const ap = ast.autoPages![0]!;
    expect(ap.auth).toBe(true);
    expect(ap.roles).toEqual(["admin", "moderator"]);
  });

  it("initializes autoPages as empty array when no autoPage blocks", () => {
    const ast = parse(`${APP}`);
    expect(ast.autoPages).toEqual([]);
  });

  it("throws when entity is missing", () => {
    expect(() =>
      parse(`
        ${APP}
        autoPage NoEntity {
          path: "/foo"
          type: list
        }
      `),
    ).toThrow("E_AUTOPAGE_NO_ENTITY");
  });

  it("throws when path is missing", () => {
    expect(() =>
      parse(`
        ${APP}
        autoPage NoPath {
          entity: Todo
          type: list
        }
      `),
    ).toThrow("E_AUTOPAGE_NO_PATH");
  });

  it("throws when type is missing", () => {
    expect(() =>
      parse(`
        ${APP}
        autoPage NoType {
          entity: Todo
          path: "/todos"
        }
      `),
    ).toThrow("E_AUTOPAGE_NO_TYPE");
  });

  it("throws on invalid type value", () => {
    expect(() =>
      parse(`
        ${APP}
        autoPage BadType {
          entity: Todo
          path: "/todos"
          type: unknown
        }
      `),
    ).toThrow("E_AUTOPAGE_INVALID_TYPE");
  });

  it("throws on unknown property", () => {
    expect(() =>
      parse(`
        ${APP}
        autoPage UnknownProp {
          entity: Todo
          path: "/todos"
          type: list
          bogusKey: something
        }
      `),
    ).toThrow("E_AUTOPAGE_UNKNOWN_PROP");
  });

  it("parses multiple autoPage blocks", () => {
    const ast = parse(`
      ${APP}
      autoPage List {
        entity: Todo
        path: "/todos"
        type: list
      }
      autoPage Create {
        entity: Todo
        path: "/todos/create"
        type: form
      }
    `);
    expect(ast.autoPages).toHaveLength(2);
    expect(ast.autoPages![0]!.name).toBe("List");
    expect(ast.autoPages![1]!.name).toBe("Create");
  });
});
