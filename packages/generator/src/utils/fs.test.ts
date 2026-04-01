import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Manifest } from "../manifest/Manifest.js";
import { commitStagedFiles, deleteOrphanedFiles } from "./fs.js";

const TMP_DIR = join(import.meta.dirname, "__fs_test__");

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function writeProjectFile(relPath: string, content: string): void {
  const abs = join(TMP_DIR, relPath);
  mkdirSync(join(TMP_DIR, relPath, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

describe("deleteOrphanedFiles", () => {
  it("deletes a file that was in the old manifest but not the new one", () => {
    const content = "export const foo = 1;";
    writeProjectFile("server/routes/todos.ts", content);

    const oldManifest = new Manifest("1.0.0");
    oldManifest.record("server/routes/todos.ts", content, "CrudGenerator");

    const newManifest = new Manifest("1.0.0");
    // todos.ts is NOT recorded in new manifest

    const deleted = deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);

    expect(deleted).toContain("server/routes/todos.ts");
    expect(existsSync(join(TMP_DIR, "server/routes/todos.ts"))).toBe(false);
  });

  it("does NOT delete a file that is still in the new manifest", () => {
    const content = "export const foo = 1;";
    writeProjectFile("server/routes/todos.ts", content);

    const oldManifest = new Manifest("1.0.0");
    oldManifest.record("server/routes/todos.ts", content, "CrudGenerator");

    const newManifest = new Manifest("1.0.0");
    newManifest.record("server/routes/todos.ts", content, "CrudGenerator");

    const deleted = deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);

    expect(deleted).not.toContain("server/routes/todos.ts");
    expect(existsSync(join(TMP_DIR, "server/routes/todos.ts"))).toBe(true);
  });

  it("does NOT delete a user-modified file even if absent from the new manifest", () => {
    const originalContent = "export const foo = 1;";
    const userContent = "export const foo = 42; // user edit";
    writeProjectFile("server/routes/todos.ts", userContent);

    const oldManifest = new Manifest("1.0.0");
    // old manifest has the original generated content
    oldManifest.record("server/routes/todos.ts", originalContent, "CrudGenerator");

    const newManifest = new Manifest("1.0.0");
    // not in new manifest

    const deleted = deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);

    expect(deleted).not.toContain("server/routes/todos.ts");
    expect(existsSync(join(TMP_DIR, "server/routes/todos.ts"))).toBe(true);
    // File content must be unchanged
    expect(readFileSync(join(TMP_DIR, "server/routes/todos.ts"), "utf8")).toBe(
      userContent,
    );
  });

  it("does NOT delete a file that no longer exists on disk", () => {
    const oldManifest = new Manifest("1.0.0");
    oldManifest.record(
      "server/routes/missing.ts",
      "const x = 1;",
      "CrudGenerator",
    );

    const newManifest = new Manifest("1.0.0");

    // Should not throw; missing file is silently skipped
    const deleted = deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);
    expect(deleted).not.toContain("server/routes/missing.ts");
  });

  it("removes the containing directory when it becomes empty after deletion", () => {
    const content = "export const route = {};";
    writeProjectFile("server/routes/stale/index.ts", content);

    const oldManifest = new Manifest("1.0.0");
    oldManifest.record(
      "server/routes/stale/index.ts",
      content,
      "CrudGenerator",
    );

    const newManifest = new Manifest("1.0.0");

    deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);

    expect(existsSync(join(TMP_DIR, "server/routes/stale"))).toBe(false);
  });

  it("does NOT remove a directory that still contains other files", () => {
    const content = "export const route = {};";
    writeProjectFile("server/routes/orphan.ts", content);
    writeProjectFile("server/routes/keeper.ts", "export const keeper = true;");

    const oldManifest = new Manifest("1.0.0");
    oldManifest.record("server/routes/orphan.ts", content, "CrudGenerator");

    const newManifest = new Manifest("1.0.0");

    deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);

    // orphan.ts removed but directory stays because keeper.ts remains
    expect(existsSync(join(TMP_DIR, "server/routes/orphan.ts"))).toBe(false);
    expect(existsSync(join(TMP_DIR, "server/routes"))).toBe(true);
    expect(existsSync(join(TMP_DIR, "server/routes/keeper.ts"))).toBe(true);
  });

  it("returns an empty array when there are no orphaned files", () => {
    const content = "const x = 1;";
    writeProjectFile("server/index.ts", content);

    const oldManifest = new Manifest("1.0.0");
    oldManifest.record("server/index.ts", content, "BackendGenerator");

    const newManifest = new Manifest("1.0.0");
    newManifest.record("server/index.ts", content, "BackendGenerator");

    const deleted = deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);
    expect(deleted).toHaveLength(0);
  });

  it("handles multiple orphaned files at once", () => {
    const files: [string, string][] = [
      ["server/routes/todos.ts", "export const todos = [];"],
      ["server/routes/tags.ts", "export const tags = [];"],
      ["server/queries/listTodos.ts", "export const query = {};"],
    ];

    const oldManifest = new Manifest("1.0.0");
    for (const [relPath, content] of files) {
      writeProjectFile(relPath, content);
      oldManifest.record(relPath, content, "CrudGenerator");
    }

    const newManifest = new Manifest("1.0.0");

    const deleted = deleteOrphanedFiles(oldManifest, newManifest, TMP_DIR);

    expect(deleted).toHaveLength(3);
    for (const [relPath] of files) {
      expect(existsSync(join(TMP_DIR, relPath))).toBe(false);
    }
  });
});

describe("commitStagedFiles — .env preservation", () => {
  const STAGING_DIR = join(TMP_DIR, "staging");
  const REAL_DIR = join(TMP_DIR, "real");

  function setup() {
    mkdirSync(STAGING_DIR, { recursive: true });
    mkdirSync(REAL_DIR, { recursive: true });
  }

  it("preserves .env when DATABASE_URL is non-placeholder", () => {
    setup();
    const originalEnv = "DATABASE_URL=postgres://user:pass@prod/db\n";
    writeFileSync(join(REAL_DIR, ".env"), originalEnv, "utf8");
    writeFileSync(
      join(STAGING_DIR, ".env"),
      "DATABASE_URL=postgres://user:password@localhost/app\n",
      "utf8",
    );

    commitStagedFiles(STAGING_DIR, REAL_DIR, { preserveEnv: true });

    expect(readFileSync(join(REAL_DIR, ".env"), "utf8")).toBe(originalEnv);
  });

  it("preserves .env when a non-DATABASE_URL key has a non-placeholder value (STRIPE_SECRET_KEY)", () => {
    setup();
    // DATABASE_URL is still the placeholder default, but user added STRIPE_SECRET_KEY
    const originalEnv =
      "DATABASE_URL=postgres://user:password@localhost/app\nSTRIPE_SECRET_KEY=sk_live_abc123\n";
    writeFileSync(join(REAL_DIR, ".env"), originalEnv, "utf8");
    writeFileSync(
      join(STAGING_DIR, ".env"),
      "DATABASE_URL=postgres://user:password@localhost/app\n",
      "utf8",
    );

    commitStagedFiles(STAGING_DIR, REAL_DIR, { preserveEnv: true });

    expect(readFileSync(join(REAL_DIR, ".env"), "utf8")).toBe(originalEnv);
  });

  it("overwrites .env when ALL values are placeholders", () => {
    setup();
    const originalEnv =
      "DATABASE_URL=postgres://user:password@localhost/app\nJWT_SECRET=change-me\n";
    const newEnv = "DATABASE_URL=postgres://user:password@localhost/newapp\n";
    writeFileSync(join(REAL_DIR, ".env"), originalEnv, "utf8");
    writeFileSync(join(STAGING_DIR, ".env"), newEnv, "utf8");

    commitStagedFiles(STAGING_DIR, REAL_DIR, { preserveEnv: true });

    expect(readFileSync(join(REAL_DIR, ".env"), "utf8")).toBe(newEnv);
  });

  it("overwrites .env when preserveEnv is false", () => {
    setup();
    const originalEnv = "DATABASE_URL=postgres://user:pass@prod/db\n";
    const newEnv = "DATABASE_URL=postgres://user:password@localhost/newapp\n";
    writeFileSync(join(REAL_DIR, ".env"), originalEnv, "utf8");
    writeFileSync(join(STAGING_DIR, ".env"), newEnv, "utf8");

    commitStagedFiles(STAGING_DIR, REAL_DIR, { preserveEnv: false });

    expect(readFileSync(join(REAL_DIR, ".env"), "utf8")).toBe(newEnv);
  });

  it("copies staged .env when no .env exists in the real dir", () => {
    setup();
    const newEnv = "DATABASE_URL=postgres://user:password@localhost/app\n";
    writeFileSync(join(STAGING_DIR, ".env"), newEnv, "utf8");

    commitStagedFiles(STAGING_DIR, REAL_DIR, { preserveEnv: true });

    expect(readFileSync(join(REAL_DIR, ".env"), "utf8")).toBe(newEnv);
  });
});

describe("commitStagedFiles — skip-unchanged optimisation", () => {
  const STAGING_DIR = join(TMP_DIR, "skip-staging");
  const REAL_DIR = join(TMP_DIR, "skip-real");

  function setup() {
    mkdirSync(STAGING_DIR, { recursive: true });
    mkdirSync(REAL_DIR, { recursive: true });
  }

  it("does not overwrite a file whose content is identical (mtime is preserved)", () => {
    setup();
    const content = "// generated\nexport const x = 1;\n";
    mkdirSync(join(REAL_DIR, "server"), { recursive: true });
    writeFileSync(join(REAL_DIR, "server/index.js"), content, "utf8");
    mkdirSync(join(STAGING_DIR, "server"), { recursive: true });
    writeFileSync(join(STAGING_DIR, "server/index.js"), content, "utf8");

    const mtimeBefore = statSync(join(REAL_DIR, "server/index.js")).mtimeMs;

    // Spin for at least 1 ms so a re-write would produce a newer mtime
    const deadline = Date.now() + 5;
    while (Date.now() < deadline) { /* busy wait */ }

    commitStagedFiles(STAGING_DIR, REAL_DIR);

    const mtimeAfter = statSync(join(REAL_DIR, "server/index.js")).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
    expect(readFileSync(join(REAL_DIR, "server/index.js"), "utf8")).toBe(content);
  });

  it("does overwrite a file whose content changed", () => {
    setup();
    const oldContent = "// old\nexport const x = 1;\n";
    const newContent = "// new\nexport const x = 2;\n";
    mkdirSync(join(REAL_DIR, "server"), { recursive: true });
    writeFileSync(join(REAL_DIR, "server/index.js"), oldContent, "utf8");
    mkdirSync(join(STAGING_DIR, "server"), { recursive: true });
    writeFileSync(join(STAGING_DIR, "server/index.js"), newContent, "utf8");

    commitStagedFiles(STAGING_DIR, REAL_DIR);

    expect(readFileSync(join(REAL_DIR, "server/index.js"), "utf8")).toBe(newContent);
  });

  it("writes a new file that does not yet exist in the real dir", () => {
    setup();
    const content = "export const brand_new = true;\n";
    mkdirSync(join(STAGING_DIR, "src"), { recursive: true });
    writeFileSync(join(STAGING_DIR, "src/new.js"), content, "utf8");

    commitStagedFiles(STAGING_DIR, REAL_DIR);

    expect(existsSync(join(REAL_DIR, "src/new.js"))).toBe(true);
    expect(readFileSync(join(REAL_DIR, "src/new.js"), "utf8")).toBe(content);
  });
});
