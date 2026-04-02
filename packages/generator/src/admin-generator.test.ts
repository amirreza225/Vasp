import { parse } from "@vasp-framework/parser";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR, MINIMAL_VASP } from "./test-helpers.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "admin");

// Shared engine instance — avoids creating a separate Handlebars environment
// and compiling ~97 templates per test (the main cause of OOM in CI).
let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

describe("AdminGenerator", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = join(TMP_DIR, `admin-gen-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
  });

  const ADMIN_VASP = `
app AdminApp {
  title: "Admin App"
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

entity Todo {
  id: Int @id
  title: String
  done: Boolean
}

entity User {
  id: Int @id
  username: String
}

admin {
  entities: [Todo, User]
}
`;

  const ADMIN_TS_VASP = `
app AdminTsApp {
  title: "Admin TS App"
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

entity Post {
  id: Int @id
  title: String
}

admin {
  entities: [Post]
}
`;

  it("does not generate a separate admin/ Vite application", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    // The top-level admin/ directory (separate Vite app) must not exist
    expect(existsSync(join(outputDir, "admin/package.json"))).toBe(false);
    expect(existsSync(join(outputDir, "admin/vite.config.js"))).toBe(false);
    expect(existsSync(join(outputDir, "admin/index.html"))).toBe(false);
    expect(existsSync(join(outputDir, "admin/src/main.js"))).toBe(false);
    expect(existsSync(join(outputDir, "admin/src/router"))).toBe(false);
  });

  it("generates admin components inside src/admin/ of the main app", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "src/admin/AdminLayout.vue"))).toBe(true);
    expect(existsSync(join(outputDir, "src/admin/views/Dashboard.vue"))).toBe(
      true,
    );
    expect(existsSync(join(outputDir, "src/admin/views/todo/index.vue"))).toBe(
      true,
    );
    expect(
      existsSync(join(outputDir, "src/admin/views/todo/FormModal.vue")),
    ).toBe(true);
    expect(existsSync(join(outputDir, "src/admin/api/todo.js"))).toBe(true);
  });

  it("generates per-entity list view with PrimeVue DataTable", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const todoView = readFileSync(
      join(outputDir, "src/admin/views/todo/index.vue"),
      "utf8",
    );
    expect(todoView).toContain("Todo");
    expect(todoView).toContain("TodoApi");
    expect(todoView).toContain("DataTable");
    expect(todoView).toContain("Column");
  });

  it("generates per-entity FormModal with PrimeVue Dialog", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const modal = readFileSync(
      join(outputDir, "src/admin/views/todo/FormModal.vue"),
      "utf8",
    );
    expect(modal).toContain("Edit Todo");
    expect(modal).toContain("Create Todo");
    expect(modal).toContain("Dialog");
  });

  it("generates per-entity API client using native fetch", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const api = readFileSync(join(outputDir, "src/admin/api/todo.js"), "utf8");
    expect(api).toContain("TodoApi");
    expect(api).toContain("/todo");
    // Uses native fetch, not axios
    expect(api).not.toContain("axios");
    expect(api).toContain("fetch(");
  });

  it("generates AdminLayout with PrimeVue PanelMenu in src/admin/", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const layout = readFileSync(
      join(outputDir, "src/admin/AdminLayout.vue"),
      "utf8",
    );
    expect(layout).toContain("Admin App");
    expect(layout).toContain("Todo");
    expect(layout).toContain("User");
    expect(layout).toContain("PanelMenu");
    expect(layout).toContain("RouterView");
  });

  it("integrates admin routes into the main SPA router", () => {
    const ast = parse(ADMIN_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const router = readFileSync(join(outputDir, "src/router/index.js"), "utf8");
    expect(router).toContain("path: '/admin'");
    expect(router).toContain("AdminLayout.vue");
    expect(router).toContain("path: 'todo'");
    expect(router).toContain("path: 'user'");
    expect(router).toContain("Dashboard.vue");
  });

  it("skips admin generation when no admin block is present", () => {
    const ast = parse(MINIMAL_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "admin"))).toBe(false);
    expect(existsSync(join(outputDir, "src/admin"))).toBe(false);
  });

  it("TS: generates .ts admin files when typescript: true", () => {
    const ast = parse(ADMIN_TS_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "src/admin/api/post.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "src/admin/views/post/index.vue"))).toBe(
      true,
    );
    expect(
      existsSync(join(outputDir, "src/admin/views/post/FormModal.vue")),
    ).toBe(true);
  });

  it("TS: admin router includes typed route entries", () => {
    const ast = parse(ADMIN_TS_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const router = readFileSync(join(outputDir, "src/router/index.ts"), "utf8");
    expect(router).toContain("RouteRecordRaw");
    expect(router).toContain("path: '/admin'");
    expect(router).toContain("path: 'post'");
  });

  const ADMIN_RELATIONS_VASP = `
app RelationsApp {
  title: "Relations App"
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

entity User {
  id: Int @id
  username: String @unique
}

entity Project {
  id: Int @id
  name: String
  owner: User @onDelete(cascade)
  assignee: User @onDelete(setNull) @nullable
}

admin {
  entities: [User, Project]
}
`;

  it("generates relation FK selects in FormModal for entities with many-to-one relations", () => {
    const ast = parse(ADMIN_RELATIONS_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const modal = readFileSync(
      join(outputDir, "src/admin/views/project/FormModal.vue"),
      "utf8",
    );
    // Imports the related entity API with the correct relative path
    expect(modal).toContain("import { UserApi } from '../../api/user.js'");
    // Only one import for User (deduped — both owner and assignee relate to User)
    expect(modal.match(/import \{ UserApi \}/g)?.length).toBe(1);
    // onMounted is added for loading options
    expect(modal).toContain("onMounted");
    // Options refs are declared
    expect(modal).toContain("const ownerOptions = ref([])");
    expect(modal).toContain("const assigneeOptions = ref([])");
    // FK fields in emptyForm
    expect(modal).toContain("ownerId: null");
    expect(modal).toContain("assigneeId: null");
    // Select form items rendered with FK binding (PrimeVue Select uses v-model)
    expect(modal).toContain('v-model="form.ownerId"');
    expect(modal).toContain('v-model="form.assigneeId"');
    // Nullable assignee has show-clear (PrimeVue Select)
    expect(modal).toContain(':show-clear="true"');
  });

  it("generates FK columns in list table for entities with many-to-one relations", () => {
    const ast = parse(ADMIN_RELATIONS_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const view = readFileSync(
      join(outputDir, "src/admin/views/project/index.vue"),
      "utf8",
    );
    // PrimeVue Column uses field="..." instead of dataIndex
    expect(view).toContain('field="ownerId"');
    expect(view).toContain('field="assigneeId"');
  });

  it("generates no relation selects for entities without many-to-one relations", () => {
    const ast = parse(ADMIN_RELATIONS_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const modal = readFileSync(
      join(outputDir, "src/admin/views/user/FormModal.vue"),
      "utf8",
    );
    // User has no relations — no onMounted, no options refs, no select for FK
    expect(modal).not.toContain("onMounted");
    expect(modal).not.toContain("Options = ref([])");
    expect(modal).not.toContain("show-clear");
  });

  const ADMIN_DATETIME_VASP = `
app DateApp {
  title: "Date App"
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

entity Task {
  id: Int @id
  title: String
  dueAt: DateTime @nullable
  startedAt: DateTime
}

admin {
  entities: [Task]
}
`;

  it("initializes nullable DateTime as null and required DateTime as empty string in emptyForm", () => {
    const ast = parse(ADMIN_DATETIME_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const modal = readFileSync(
      join(outputDir, "src/admin/views/task/FormModal.vue"),
      "utf8",
    );
    // Nullable DateTime initializes to null, not ''
    expect(modal).toContain("dueAt: null");
    // Non-nullable DateTime initializes to ''
    expect(modal).toContain("startedAt: ''");
    // nullableDateTimeFields list declared for submit coercion
    expect(modal).toContain("nullableDateTimeFields");
    expect(modal).toContain("'dueAt'");
    // startedAt should NOT appear in nullableDateTimeFields
    expect(modal).not.toMatch(
      /'startedAt'.*nullableDateTime|nullableDateTime.*'startedAt'/,
    );
    // Payload coercion: empty string → null for nullable DateTime
    expect(modal).toContain("for (const k of nullableDateTimeFields)");
    expect(modal).toContain("payload[k] === ''");
  });
});
