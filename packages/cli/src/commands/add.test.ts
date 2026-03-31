/**
 * Unit tests for appendToVasp() — the helper that validates a generated DSL
 * block through the full parse pipeline before writing it to main.vasp.
 */

import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendToVasp } from "./add.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "add");
const VASP_FILE = join(TMP_DIR, "main.vasp");

const MINIMAL_SOURCE = `
app TestApp {
  title: "Test"
  db: Drizzle
  ssr: false
  typescript: true
}
`.trimStart();

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(VASP_FILE, MINIMAL_SOURCE, "utf8");
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? ""})`);
  }) as typeof process.exit);
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("appendToVasp — valid block", () => {
  it("writes the new source to disk when the block parses successfully", () => {
    const block = [
      `\nentity Post {`,
      `  id: Int @id`,
      `  title: String`,
      `}\n`,
    ].join("\n");

    appendToVasp(VASP_FILE, MINIMAL_SOURCE, block);

    const written = readFileSync(VASP_FILE, "utf8");
    expect(written).toContain("entity Post");
    expect(written).toContain("id: Int @id");
  });

  it("writes a valid crud block to disk", () => {
    // First add the entity so crud's semantic check passes
    const entityBlock = [
      `\nentity Task {`,
      `  id: Int @id`,
      `  title: String`,
      `}\n`,
    ].join("\n");
    appendToVasp(VASP_FILE, MINIMAL_SOURCE, entityBlock);
    const withEntity = readFileSync(VASP_FILE, "utf8");

    const crudBlock = [
      `\ncrud Task {`,
      `  entity: Task`,
      `  operations: [list, create, update, delete]`,
      `}\n`,
    ].join("\n");
    appendToVasp(VASP_FILE, withEntity, crudBlock);

    const written = readFileSync(VASP_FILE, "utf8");
    expect(written).toContain("crud Task");
  });
});

describe("appendToVasp — invalid block", () => {
  it("calls process.exit(1) without modifying the file when the block is syntactically malformed", () => {
    const badBlock = `\nentity Broken {\n  ???: InvalidType\n}\n`;

    expect(() => appendToVasp(VASP_FILE, MINIMAL_SOURCE, badBlock)).toThrow(
      "process.exit(1)",
    );

    // main.vasp must remain unchanged
    const onDisk = readFileSync(VASP_FILE, "utf8");
    expect(onDisk).toBe(MINIMAL_SOURCE);
    expect(onDisk).not.toContain("Broken");
  });

  it("calls process.exit(1) without modifying the file when the block references an unknown page (E101)", () => {
    // route block references a page that does not exist → SemanticValidator E101
    const badBlock = [
      `\nroute GhostRoute {`,
      `  path: "/ghost"`,
      `  to: NonExistentPage`,
      `}\n`,
    ].join("\n");

    expect(() => appendToVasp(VASP_FILE, MINIMAL_SOURCE, badBlock)).toThrow(
      "process.exit(1)",
    );

    const onDisk = readFileSync(VASP_FILE, "utf8");
    expect(onDisk).toBe(MINIMAL_SOURCE);
  });

  it("does not write the file when parse fails, even if the file was absent on disk", () => {
    rmSync(VASP_FILE);
    const badBlock = `\nentity Bad {\n  ???\n}\n`;

    expect(() => appendToVasp(VASP_FILE, MINIMAL_SOURCE, badBlock)).toThrow(
      "process.exit(1)",
    );

    expect(existsSync(VASP_FILE)).toBe(false);
  });
});
