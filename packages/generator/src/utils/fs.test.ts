import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Manifest } from "../manifest/Manifest.js";
import { deleteOrphanedFiles } from "./fs.js";

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
