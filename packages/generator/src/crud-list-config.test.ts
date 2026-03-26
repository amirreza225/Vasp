import { parse } from "@vasp-framework/parser";
import { mkdirSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR } from "./test-helpers.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "list-config");

// Shared engine instance — avoids creating a separate Handlebars environment
// and compiling ~97 templates per test (the main cause of OOM in CI).
let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

describe("CRUD list config — pagination, filtering, sorting, search", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = join(TMP_DIR, `list-config-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it("generates page-based pagination when paginate: true", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Task { id: Int @id title: String status: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: true
          sortable: [title]
          filterable: [status]
          search: [title]
        }
      }
    `;
    const ast = parse(source);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/task.js"),
      "utf8",
    );
    expect(route).toContain("query.page");
    expect(route).toContain("(page - 1) * limit");
    expect(route).toContain("page, limit");
    expect(route).not.toContain("query.offset");
  });

  it("generates allowlisted sort fields when sortable is set", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: [createdAt, title]
          filterable: []
          search: []
        }
      }
    `;
    const ast = parse(source);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/task.js"),
      "utf8",
    );
    expect(route).toContain("SORTABLE_FIELDS");
    expect(route).toContain("'createdAt'");
    expect(route).toContain("'title'");
    expect(route).toContain("query.sortBy");
    expect(route).not.toContain("orderByFields");
  });

  it("generates allowlisted filter fields when filterable is set", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Task { id: Int @id title: String status: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: [status]
          search: []
        }
      }
    `;
    const ast = parse(source);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/task.js"),
      "utf8",
    );
    expect(route).toContain("FILTERABLE_FIELDS");
    expect(route).toContain("'status'");
    expect(route).not.toContain("key.startsWith('filter.')");
  });

  it("generates ilike full-text search when search fields are set", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Task { id: Int @id title: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: false
          sortable: []
          filterable: []
          search: [title]
        }
      }
    `;
    const ast = parse(source);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/crud/task.js"),
      "utf8",
    );
    expect(route).toContain("ilike");
    expect(route).toContain("query.search");
    expect(route).toContain("table.title");
  });

  it("preserves existing offset-based behavior when no list config", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      crud Todo { entity: Todo operations: [list] }
    `;
    const ast = parse(source);
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
    expect(route).toContain("query.offset");
    expect(route).toContain("orderByFields");
    expect(route).not.toContain("SORTABLE_FIELDS");
    expect(route).not.toContain("FILTERABLE_FIELDS");
  });

  it("TS client: list() accepts typed params when listConfig is set", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      entity Task { id: Int @id title: String status: String }
      crud Task {
        entity: Task
        operations: [list]
        list: {
          paginate: true
          sortable: [title, createdAt]
          filterable: [status]
          search: [title]
        }
      }
    `;
    const ast = parse(source);
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
    expect(crud).toContain("'title'");
    expect(crud).toContain("'createdAt'");
    expect(crud).toContain("page?: number");
    expect(crud).toContain("search?: string");
    expect(crud).toContain("query,");
  });
});
