/**
 * VaspDocScanner.test.ts — Unit tests for the fault-tolerant VaspDocScanner.
 *
 * Replaces the old Chevrotain-based VaspParser.test.ts. Tests both valid and
 * invalid .vasp inputs, checking DocumentAST shape and error recovery.
 */

import { describe, it, expect } from "vitest";
import { parseDocument } from "../grammar/VaspDocScanner.js";

function scan(source: string) {
  return parseDocument(source);
}

describe("VaspDocScanner — valid inputs", () => {
  it("parses an empty file without errors", () => {
    const { ast, errors } = scan("");
    expect(errors).toHaveLength(0);
    expect(ast.blocks).toHaveLength(0);
  });

  it("parses a minimal app block", () => {
    const { ast, errors } = scan(`
      app MyApp {
        title: "My App"
        db: Drizzle
        ssr: false
        typescript: true
      }
    `);
    expect(errors).toHaveLength(0);
    expect(ast.blocks).toHaveLength(1);
    const app = ast.blocks[0];
    expect(app?.kind).toBe("app");
    expect(app?.name).toBe("MyApp");
  });

  it("parses an entity block with typed fields", () => {
    const { ast, errors } = scan(`
      entity Todo {
        id:    Int    @id
        title: String
        done:  Boolean
        score: Float @nullable
      }
    `);
    expect(errors).toHaveLength(0);
    const entity = ast.blocks[0];
    expect(entity?.kind).toBe("entity");
    expect(entity?.name).toBe("Todo");
    expect(entity?.fields?.["id"]).toBe("Int");
    expect(entity?.fields?.["title"]).toBe("String");
    expect(entity?.fields?.["done"]).toBe("Boolean");
    expect(entity?.fields?.["score"]).toBe("Float");
  });

  it("parses all primitive field types", () => {
    const { ast } = scan(`
      entity AllTypes {
        a: String
        b: Int
        c: Boolean
        d: DateTime
        e: Float
        f: Text
        g: Json
        h: File @storage(uploads)
        i: Enum(low, medium, high)
      }
    `);
    const f = ast.blocks[0]?.fields ?? {};
    expect(f["a"]).toBe("String");
    expect(f["b"]).toBe("Int");
    expect(f["c"]).toBe("Boolean");
    expect(f["d"]).toBe("DateTime");
    expect(f["e"]).toBe("Float");
    expect(f["f"]).toBe("Text");
    expect(f["g"]).toBe("Json");
    expect(f["h"]).toBe("File");
    expect(f["i"]).toBe("Enum");
  });

  it("parses a field with v2 config block (label, placeholder, validate)", () => {
    const { ast } = scan(`
      entity Post {
        id: Int @id
        title: String {
          label: "Post Title"
          placeholder: "Enter a title…"
          validate {
            required: true
            minLength: 3
            maxLength: 120
          }
        }
      }
    `);
    expect(ast.blocks[0]?.kind).toBe("entity");
    expect(ast.blocks[0]?.fields?.["title"]).toBe("String");
  });

  it("parses a crud block with nested list and form sub-blocks", () => {
    const { ast } = scan(`
      crud Todo {
        entity: Todo
        operations: [list, create, update, delete]

        list {
          paginate: true
          sortable: [title, createdAt]
          filterable: [done]
          search: [title]
          columns {
            title { label: "Task" width: "40%" sortable: true }
            done  { label: "Done" width: "80px" }
          }
        }

        form {
          layout: "2-column"
          sections {
            basics { label: "Basic Info" fields: [title] }
            status { label: "Status" fields: [done] }
          }
        }

        permissions {
          list:   [admin, user]
          create: [admin]
          delete: [admin]
        }
      }
    `);
    const crud = ast.blocks[0];
    expect(crud?.kind).toBe("crud");
    expect(crud?.name).toBe("Todo");
    expect(crud?.entityRef).toBe("Todo");
  });

  it("parses a route block and extracts 'to' page reference", () => {
    const { ast } = scan(`
      route Home { path: "/" to: HomePage }
    `);
    const route = ast.blocks[0];
    expect(route?.kind).toBe("route");
    expect(route?.toPage).toBe("HomePage");
  });

  it("parses multiple blocks in one file", () => {
    const { ast } = scan(`
      app A { title: "App" db: Drizzle ssr: false typescript: true }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String author: User }
      crud Todo { entity: Todo operations: [list, create] }
      route Home { path: "/" to: Index }
      page Index { component: import Index from "@src/pages/Index.vue" }
    `);
    expect(ast.blocks).toHaveLength(6);
    const kinds = ast.blocks.map((b) => b.kind);
    expect(kinds).toContain("app");
    expect(kinds).toContain("entity");
    expect(kinds).toContain("crud");
    expect(kinds).toContain("route");
    expect(kinds).toContain("page");
  });

  it("parses a job block with PgBoss executor and perform sub-block", () => {
    const { ast } = scan(`
      job sendEmail {
        executor: PgBoss
        perform {
          fn: import { sendEmail } from "@src/jobs/email.ts"
        }
        schedule: "0 9 * * *"
        retries: 3
      }
    `);
    const job = ast.blocks[0];
    expect(job?.kind).toBe("job");
    expect(job?.name).toBe("sendEmail");
  });

  it("parses a job block with BullMQ executor", () => {
    const { ast } = scan(`
      job processQueue {
        executor: BullMQ
        perform {
          fn: import { processQueue } from "@src/jobs/queue.ts"
          concurrency: 5
        }
      }
    `);
    expect(ast.blocks[0]?.kind).toBe("job");
  });

  it("parses auth block", () => {
    const { ast } = scan(`
      auth MyAuth {
        userEntity: User
        methods: [usernameAndPassword, google]
      }
    `);
    expect(ast.blocks[0]?.kind).toBe("auth");
  });

  it("parses line comments and block comments without errors", () => {
    const { errors } = scan(`
      // This is a comment
      /* Block comment */
      app A {
        title: "App" // inline comment
        db: Drizzle
        ssr: false
        typescript: true
      }
    `);
    expect(errors).toHaveLength(0);
  });

  it("records nameOffset and nameLength for entity blocks", () => {
    const source = `entity Todo { id: Int @id }`;
    const { ast } = scan(source);
    const entity = ast.blocks[0];
    expect(entity?.nameOffset).toBeDefined();
    expect(entity?.nameLength).toBe(4); // "Todo"
  });

  it("records nameOffset and nameLength for page blocks", () => {
    const source = `page HomePage { component: import H from "@src/pages/H.vue" }`;
    const { ast } = scan(source);
    const page = ast.blocks[0];
    expect(page?.kind).toBe("page");
    expect(page?.nameLength).toBe(8); // "HomePage"
  });

  it("parses all 20 block types", () => {
    const { ast } = scan(`
      app A { title: "t" db: Drizzle ssr: false typescript: true }
      auth Auth { userEntity: User methods: [usernameAndPassword] }
      entity E { id: Int @id }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      query q { fn: import { q } from "@src/q.ts" entities: [E] }
      action a { fn: import { a } from "@src/a.ts" entities: [E] }
      api myApi { method: GET path: "/api" fn: import { myApi } from "@src/api.ts" }
      middleware mw { fn: import { mw } from "@src/mw.ts" scope: global }
      crud C { entity: E operations: [list] }
      realtime R2 { entity: E }
      job J { executor: PgBoss perform { fn: import { J } from "@src/J.ts" } }
      seed S { fn: import { S } from "@src/seed.ts" }
      admin Admin { entities: [E] }
      storage uploads { provider: local }
      email mailer { provider: resend from: "a@b.com" }
      cache apiCache { provider: memory ttl: 60 }
      webhook wh { mode: inbound path: "/wh" fn: import { wh } from "@src/wh.ts" }
      observability obs { tracing: true metrics: true }
      autoPage todoList { entity: E pageType: list }
    `);
    const kinds = ast.blocks.map((b) => b.kind);
    expect(kinds).toContain("app");
    expect(kinds).toContain("auth");
    expect(kinds).toContain("entity");
    expect(kinds).toContain("route");
    expect(kinds).toContain("page");
    expect(kinds).toContain("query");
    expect(kinds).toContain("action");
    expect(kinds).toContain("api");
    expect(kinds).toContain("middleware");
    expect(kinds).toContain("crud");
    expect(kinds).toContain("realtime");
    expect(kinds).toContain("job");
    expect(kinds).toContain("seed");
    expect(kinds).toContain("admin");
    expect(kinds).toContain("storage");
    expect(kinds).toContain("email");
    expect(kinds).toContain("cache");
    expect(kinds).toContain("webhook");
    expect(kinds).toContain("observability");
    expect(kinds).toContain("autoPage");
    expect(ast.blocks).toHaveLength(20);
  });
});

describe("VaspDocScanner — error recovery", () => {
  it("recovers from a missing closing brace and still parses remaining blocks", () => {
    const source = `
      entity BadEntity {
        id: Int @id
        title: String
      // missing closing brace

      entity GoodEntity {
        id: Int @id
        name: String
      }
    `;
    const { ast } = scan(source);
    // Should still find GoodEntity due to error recovery
    const hasGoodEntity = ast.blocks.some(
      (b) => b.kind === "entity" && b.name === "GoodEntity",
    );
    expect(hasGoodEntity).toBe(true);
  });

  it("never throws on malformed input", () => {
    expect(() => scan("entity 123 { }")).not.toThrow();
    expect(() => scan("{ } { }")).not.toThrow();
    expect(() => scan("entity")).not.toThrow();
    expect(() => scan("entity Foo")).not.toThrow();
  });

  it("handles deeply nested blocks without crashing", () => {
    const { ast } = scan(`
      crud DeepNested {
        entity: MyEntity
        list {
          columns {
            name { label: "Name" width: "100px" sortable: true }
          }
        }
        form {
          sections {
            main { label: "Main" fields: [name] }
          }
        }
      }
    `);
    const crud = ast.blocks[0];
    expect(crud?.kind).toBe("crud");
    expect(crud?.entityRef).toBe("MyEntity");
  });

  it("returns empty blocks array for completely invalid input", () => {
    const { ast } = scan("!@#$%^&*()");
    expect(ast.blocks).toHaveLength(0);
  });
});
