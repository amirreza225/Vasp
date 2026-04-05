/**
 * diagnostics.test.ts — Tests for validateDocument().
 *
 * Verifies that the language server surfaces the full set of SemanticValidator
 * error codes (E100–E126+) from @vasp-framework/parser rather than the small
 * subset the old Chevrotain-only checker covered.
 */

import { describe, it, expect } from "vitest";
import { validateDocument } from "../features/diagnostics.js";
import { DiagnosticSeverity } from "vscode-languageserver";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function codes(text: string): string[] {
  return validateDocument(text).map((d) => String(d.code));
}

// ---------------------------------------------------------------------------
// Syntactically valid, semantically correct document → no diagnostics
// ---------------------------------------------------------------------------

const MINIMAL_VALID = `
app MyApp {
  title: "My App"
  db: Drizzle
  ssr: false
  typescript: false
}
`.trim();

describe("validateDocument — valid document", () => {
  it("returns no diagnostics for a valid minimal app", () => {
    expect(validateDocument(MINIMAL_VALID)).toHaveLength(0);
  });

  it("returns no diagnostics for a valid full document", () => {
    const src = `
      app TodoApp {
        title: "Todos"
        db: Drizzle
        ssr: false
        typescript: true
      }
      entity Todo {
        id: Int @id
        title: String
      }
      crud Todos {
        entity: Todo
        operations: [list, create]
      }
      route Home {
        path: "/"
        to: HomePage
      }
      page HomePage {
        component: import Home from "@src/pages/Home.vue"
      }
    `;
    expect(validateDocument(src)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// E100 — missing app block
// ---------------------------------------------------------------------------

describe("validateDocument — E100 missing app block", () => {
  it("reports E100_MISSING_APP_BLOCK when there is no app block", () => {
    const src = `entity Foo { id: Int @id }`;
    expect(codes(src)).toContain("E100_MISSING_APP_BLOCK");
  });
});

// ---------------------------------------------------------------------------
// E101 — unknown page reference in route
// ---------------------------------------------------------------------------

describe("validateDocument — E101 unknown page ref", () => {
  it("reports E101_UNKNOWN_PAGE_REF when route.to references a non-existent page", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      route Home { path: "/" to: NonExistentPage }
    `;
    expect(codes(src)).toContain("E101_UNKNOWN_PAGE_REF");
  });
});

// ---------------------------------------------------------------------------
// E102 / E103 — empty or invalid CRUD operations
// ---------------------------------------------------------------------------

describe("validateDocument — CRUD operation errors", () => {
  it("reports E103_UNKNOWN_CRUD_OPERATION for invalid operations", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id title: String }
      crud Todos { entity: Todo operations: [list, foobar] }
    `;
    const result = codes(src);
    expect(result).toContain("E103_UNKNOWN_CRUD_OPERATION");
  });
});

// ---------------------------------------------------------------------------
// E104 — realtime entity not found
// ---------------------------------------------------------------------------

describe("validateDocument — E104 realtime without entity block", () => {
  it("reports E104_REALTIME_ENTITY_NOT_FOUND when realtime entity has no entity block", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      realtime TodoChannel { entity: Todo events: [created] }
    `;
    expect(codes(src)).toContain("E104_REALTIME_ENTITY_NOT_FOUND");
  });

  it("does not report E104 when realtime entity exists (no crud required)", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id title: String }
      realtime TodoChannel { entity: Todo events: [created] }
    `;
    expect(codes(src)).not.toContain("E104_REALTIME_ENTITY_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// E107 — unknown auth method
// ---------------------------------------------------------------------------

describe("validateDocument — E107 unknown auth method", () => {
  it("reports E107_UNKNOWN_AUTH_METHOD for an unrecognised auth method", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id username: String }
      auth MyAuth { userEntity: User methods: [usernameAndPassword, oauth2] }
    `;
    expect(codes(src)).toContain("E107_UNKNOWN_AUTH_METHOD");
  });
});

// ---------------------------------------------------------------------------
// E108/E109 — unknown entity ref in query/action
// ---------------------------------------------------------------------------

describe("validateDocument — E108/E109 unknown entity in query/action", () => {
  it("reports E108_UNKNOWN_ENTITY_REF for undefined entity in query", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [UndeclaredEntity]
      }
    `;
    expect(codes(src)).toContain("E108_UNKNOWN_ENTITY_REF");
  });

  it("reports E109_UNKNOWN_ENTITY_REF for undefined entity in action", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Ghost]
      }
    `;
    expect(codes(src)).toContain("E109_UNKNOWN_ENTITY_REF");
  });
});

// ---------------------------------------------------------------------------
// E110 — unknown job executor
// ---------------------------------------------------------------------------

describe("validateDocument — E110 unknown job executor", () => {
  it("reports E110_UNKNOWN_JOB_EXECUTOR for an unsupported executor", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      job myJob {
        executor: UnknownQueue
        perform: { fn: import { myJob } from "@src/jobs.js" }
      }
    `;
    expect(codes(src)).toContain("E110_UNKNOWN_JOB_EXECUTOR");
  });
});

// ---------------------------------------------------------------------------
// E111 — CRUD entity not declared
// ---------------------------------------------------------------------------

describe("validateDocument — E111 crud entity not declared", () => {
  it("reports E111_CRUD_ENTITY_NOT_DECLARED when crud.entity has no entity block", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      entity Other { id: Int @id name: String }
      crud Todos { entity: Todo operations: [list] }
    `;
    // SemanticValidator E111 fires when the entity name does not have
    // an entity block declared anywhere in the file.
    // (Requires at least one other entity block so the early-return guard is bypassed.)
    expect(codes(src)).toContain("E111_CRUD_ENTITY_NOT_DECLARED");
  });
});

// ---------------------------------------------------------------------------
// E112 — duplicate entity name
// ---------------------------------------------------------------------------

describe("validateDocument — E112 duplicate entity", () => {
  it("reports E112_DUPLICATE_ENTITY when two entity blocks share a name", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id username: String }
      entity User { id: Int @id email: String }
    `;
    expect(codes(src)).toContain("E112_DUPLICATE_ENTITY");
  });
});

// ---------------------------------------------------------------------------
// E113 — duplicate route path
// ---------------------------------------------------------------------------

describe("validateDocument — E113 duplicate route path", () => {
  it("reports E113_DUPLICATE_ROUTE_PATH when two routes share the same path", () => {
    const src = `
      app A { title: "A" db: Drizzle ssr: false typescript: false }
      page HomeA { component: import HomeA from "@src/pages/HomeA.vue" }
      page HomeB { component: import HomeB from "@src/pages/HomeB.vue" }
      route R1 { path: "/" to: HomeA }
      route R2 { path: "/" to: HomeB }
    `;
    expect(codes(src)).toContain("E113_DUPLICATE_ROUTE_PATH");
  });
});

// ---------------------------------------------------------------------------
// Diagnostic shape
// ---------------------------------------------------------------------------

describe("validateDocument — diagnostic shape", () => {
  it("returns diagnostics with the correct LSP shape", () => {
    const src = `entity Foo { id: Int @id }`;
    const diags = validateDocument(src);
    expect(diags.length).toBeGreaterThan(0);
    const d = diags[0]!;
    expect(d).toHaveProperty("severity");
    expect(d).toHaveProperty("range");
    expect(d.range).toHaveProperty("start");
    expect(d.range).toHaveProperty("end");
    expect(d).toHaveProperty("message");
    expect(d).toHaveProperty("source", "vasp");
    expect(d).toHaveProperty("code");
    // E100 is an error
    expect(d.severity).toBe(DiagnosticSeverity.Error);
  });

  it("includes the hint text in the diagnostic message", () => {
    const src = `entity Foo { id: Int @id }`;
    const diags = validateDocument(src);
    const d = diags.find((x) => String(x.code) === "E100_MISSING_APP_BLOCK");
    expect(d).toBeDefined();
    expect(d!.message).toContain("Hint:");
  });

  it("diagnostic range has non-negative line and character", () => {
    const src = `entity Foo { id: Int @id }`;
    const diags = validateDocument(src);
    for (const d of diags) {
      expect(d.range.start.line).toBeGreaterThanOrEqual(0);
      expect(d.range.start.character).toBeGreaterThanOrEqual(0);
    }
  });
});
