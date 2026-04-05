import { parse } from "@vasp-framework/parser";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR } from "./test-helpers.js";

const TMP_DIR = join(
  import.meta.dirname,
  "__test_output__",
  "autopage-generator",
);

let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

const BASE_VASP = `
app TestApp {
  title: "Test App"
  db: Drizzle
  ssr: false
  typescript: true
}

entity Todo {
  id:        Int      @id
  title:     String   @validate(minLength: 1)
  done:      Boolean
  status:    Enum(active, archived)
  content:   Text     @nullable
  createdAt: DateTime @default(now)
}
`;

describe("AutoPageGenerator", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("generates a list page Vue SFC in src/pages/", () => {
    const vasp = `
      ${BASE_VASP}
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
        title: "Todo List"
        columns: [id, title, status, done]
        sortable: [title]
        filterable: [status]
        searchable: [title]
        rowActions: [view, edit, delete]
        topActions: [create]
        paginate: true
        pageSize: 20
      }
    `;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const pagePath = join(TMP_DIR, "src/pages/TodoList.vue");
    expect(existsSync(pagePath)).toBe(true);

    const content = readFileSync(pagePath, "utf8");
    expect(content).toContain("DataTable");
    expect(content).toContain("primevue/datatable");
    expect(content).toContain("<Column");
    expect(content).toContain("Todo List");
    expect(content).toContain("confirmDelete");
    expect(content).toContain("/todos");
  });

  it("generates a form page Vue SFC in src/pages/", () => {
    const vasp = `
      ${BASE_VASP}
      autoPage CreateTodo {
        entity: Todo
        path: "/todos/create"
        type: form
        title: "Create Todo"
        fields: [title, content, status, done]
        layout: "2-column"
        successRoute: "/todos"
      }
    `;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const pagePath = join(TMP_DIR, "src/pages/CreateTodo.vue");
    expect(existsSync(pagePath)).toBe(true);

    const content = readFileSync(pagePath, "utf8");
    expect(content).toContain("@primevue/forms");
    expect(content).toContain("<Form");
    expect(content).toContain("ToggleSwitch");
    expect(content).toContain("Select");
    expect(content).toContain("grid-cols-2");
    expect(content).toContain("/todos");
  });

  it("generates a detail page Vue SFC in src/pages/", () => {
    const vasp = `
      ${BASE_VASP}
      autoPage TodoDetail {
        entity: Todo
        path: "/todos/:id"
        type: detail
        title: "Todo Detail"
        fields: [id, title, status, done, createdAt]
      }
    `;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const pagePath = join(TMP_DIR, "src/pages/TodoDetail.vue");
    expect(existsSync(pagePath)).toBe(true);

    const content = readFileSync(pagePath, "utf8");
    expect(content).toContain("Skeleton");
    expect(content).toContain("confirmDelete");
    expect(content).toContain("Todo Detail");
  });

  it("includes PrimeVue in package.json dependencies", () => {
    const vasp = BASE_VASP;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const pkgPath = join(TMP_DIR, "package.json");
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<
      string,
      Record<string, string>
    >;
    expect(pkg.dependencies?.primevue).toBeDefined();
    expect(pkg.dependencies?.["@primevue/themes"]).toBeDefined();
    expect(pkg.dependencies?.["primeicons"]).toBeDefined();
  });

  it("includes PrimeVue plugin setup in main.ts", () => {
    const vasp = BASE_VASP;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const mainPath = join(TMP_DIR, "src/main.ts");
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain("PrimeVue");
    expect(content).toContain("ToastService");
    expect(content).toContain("ConfirmationService");
    expect(content).toContain("primeicons/primeicons.css");
  });

  it("includes Toast and ConfirmDialog in App.vue", () => {
    const vasp = BASE_VASP;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const appPath = join(TMP_DIR, "src/App.vue");
    const content = readFileSync(appPath, "utf8");
    expect(content).toContain("<Toast");
    expect(content).toContain("<ConfirmDialog");
    expect(content).toContain("<DynamicDialog");
  });

  it("registers autoPage route in the Vue Router", () => {
    const vasp = `
      ${BASE_VASP}
      autoPage TodoList {
        entity: Todo
        path: "/todos"
        type: list
      }
    `;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const routerPath = join(TMP_DIR, "src/router/index.ts");
    const content = readFileSync(routerPath, "utf8");
    expect(content).toContain("path: '/todos'");
    expect(content).toContain("pages/TodoList.vue");
  });

  it("skips generation when no autoPages defined", () => {
    const ast = parse(BASE_VASP);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);
    const generated = result.filesWritten.filter((f) =>
      f.startsWith("src/pages/"),
    );
    // No autoPage files (scaffolded pages would be in @src, not src/pages here)
    // NotFound.vue is always emitted as part of the SPA router setup
    const autoPageFiles = generated.filter((f) => f.endsWith(".vue") && !f.includes("NotFound"));
    expect(autoPageFiles).toHaveLength(0);
  });

  it("uses 1-column layout by default for form pages", () => {
    const vasp = `
      ${BASE_VASP}
      autoPage CreateTodo {
        entity: Todo
        path: "/todos/create"
        type: form
        fields: [title, done]
      }
    `;
    const ast = parse(vasp);
    const result = generate(ast, {
      outputDir: TMP_DIR,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(result.success).toBe(true);

    const content = readFileSync(
      join(TMP_DIR, "src/pages/CreateTodo.vue"),
      "utf8",
    );
    // Default 1-column layout — no grid-cols-2
    expect(content).not.toContain("grid-cols-2");
  });
});
