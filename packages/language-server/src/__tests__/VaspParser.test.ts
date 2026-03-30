/**
 * VaspParser.test.ts — Unit tests for the Chevrotain-based Vasp parser.
 * Tests both valid and invalid .vasp inputs, checking CST shape and error recovery.
 */

import { describe, it, expect } from "vitest";
import { VaspLexer } from "../grammar/VaspLexer.js";
import { getVaspParser } from "../grammar/VaspParser.js";
import { getVaspVisitor } from "../grammar/VaspCstVisitor.js";

function parse(source: string) {
  const lexResult = VaspLexer.tokenize(source);
  const parser = getVaspParser();
  parser.input = lexResult.tokens;
  const cst = parser.vaspFile();
  const visitor = getVaspVisitor();
  const ast = visitor.visit(cst);
  return {
    ast,
    lexErrors: lexResult.errors,
    parseErrors: parser.errors,
  };
}

describe("VaspParser — valid inputs", () => {
  it("parses an empty file without errors", () => {
    const { ast, lexErrors, parseErrors } = parse("");
    expect(lexErrors).toHaveLength(0);
    expect(parseErrors).toHaveLength(0);
    expect(ast.blocks).toHaveLength(0);
  });

  it("parses a minimal app block", () => {
    const { ast, parseErrors } = parse(`
      app MyApp {
        title: "My App"
        db: Drizzle
        ssr: false
        typescript: true
      }
    `);
    expect(parseErrors).toHaveLength(0);
    expect(ast.blocks).toHaveLength(1);
    const app = ast.blocks[0];
    expect(app?.kind).toBe("app");
    expect(app?.name).toBe("MyApp");
  });

  it("parses an entity block with typed fields", () => {
    const { ast, parseErrors } = parse(`
      entity Todo {
        id:    Int    @id
        title: String
        done:  Boolean
        score: Float @nullable
      }
    `);
    expect(parseErrors).toHaveLength(0);
    const entity = ast.blocks[0];
    expect(entity?.kind).toBe("entity");
    expect(entity?.name).toBe("Todo");
    expect(entity?.fields?.["id"]).toBe("Int");
    expect(entity?.fields?.["title"]).toBe("String");
    expect(entity?.fields?.["done"]).toBe("Boolean");
    expect(entity?.fields?.["score"]).toBe("Float");
  });

  it("parses all primitive field types", () => {
    const { ast, parseErrors } = parse(`
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
    expect(parseErrors).toHaveLength(0);
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
    const { ast, parseErrors } = parse(`
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
    expect(parseErrors).toHaveLength(0);
    expect(ast.blocks[0]?.kind).toBe("entity");
    expect(ast.blocks[0]?.fields?.["title"]).toBe("String");
  });

  it("parses a crud block with nested list and form sub-blocks", () => {
    const { ast, parseErrors } = parse(`
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
    expect(parseErrors).toHaveLength(0);
    const crud = ast.blocks[0];
    expect(crud?.kind).toBe("crud");
    expect(crud?.name).toBe("Todo");
    expect(crud?.entityRef).toBe("Todo");
  });

  it("parses a route block and extracts 'to' page reference", () => {
    const { ast, parseErrors } = parse(`
      route Home { path: "/" to: HomePage }
    `);
    expect(parseErrors).toHaveLength(0);
    const route = ast.blocks[0];
    expect(route?.kind).toBe("route");
    expect(route?.toPage).toBe("HomePage");
  });

  it("parses multiple blocks in one file", () => {
    const { ast, parseErrors } = parse(`
      app A { title: "App" db: Drizzle ssr: false typescript: true }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String author: User }
      crud Todo { entity: Todo operations: [list, create] }
      route Home { path: "/" to: Index }
      page Index { component: import Index from "@src/pages/Index.vue" }
    `);
    expect(parseErrors).toHaveLength(0);
    expect(ast.blocks).toHaveLength(6);
    const kinds = ast.blocks.map((b) => b.kind);
    expect(kinds).toContain("app");
    expect(kinds).toContain("entity");
    expect(kinds).toContain("crud");
    expect(kinds).toContain("route");
    expect(kinds).toContain("page");
  });

  it("parses a job block with PgBoss executor and perform sub-block", () => {
    const { ast, parseErrors } = parse(`
      job sendEmail {
        executor: PgBoss
        perform {
          fn: import { sendEmail } from "@src/jobs/email.ts"
        }
        schedule: "0 9 * * *"
        retries: 3
      }
    `);
    expect(parseErrors).toHaveLength(0);
    const job = ast.blocks[0];
    expect(job?.kind).toBe("job");
    expect(job?.name).toBe("sendEmail");
  });

  it("parses a job block with BullMQ executor", () => {
    const { ast, parseErrors } = parse(`
      job processQueue {
        executor: BullMQ
        perform {
          fn: import { processQueue } from "@src/jobs/queue.ts"
          concurrency: 5
        }
      }
    `);
    expect(parseErrors).toHaveLength(0);
    expect(ast.blocks[0]?.kind).toBe("job");
  });

  it("parses auth block", () => {
    const { ast, parseErrors } = parse(`
      auth MyAuth {
        userEntity: User
        methods: [usernameAndPassword, google]
      }
    `);
    expect(parseErrors).toHaveLength(0);
    expect(ast.blocks[0]?.kind).toBe("auth");
  });

  it("parses line comments and block comments without errors", () => {
    const { parseErrors } = parse(`
      // This is a comment
      /* Block comment */
      app A {
        title: "App" // inline comment
        db: Drizzle
        ssr: false
        typescript: true
      }
    `);
    expect(parseErrors).toHaveLength(0);
  });
});

describe("VaspParser — error recovery", () => {
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
    const { ast } = parse(source);
    // Should still find GoodEntity due to error recovery
    const hasGoodEntity = ast.blocks.some(
      (b) => b.kind === "entity" && b.name === "GoodEntity",
    );
    expect(hasGoodEntity).toBe(true);
  });

  it("produces parse errors for invalid tokens", () => {
    const { parseErrors } = parse(`entity 123BadName { id: Int @id }`);
    // The number "123" is not a valid identifier
    expect(parseErrors.length).toBeGreaterThan(0);
  });
});
