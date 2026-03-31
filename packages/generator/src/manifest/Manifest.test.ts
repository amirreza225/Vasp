import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Manifest, computeHash } from "./Manifest.js";

const TMP_DIR = join(import.meta.dirname, "__manifest_test__");

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("computeHash", () => {
  it("returns a hex string", () => {
    const hash = computeHash("hello world");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same hash for the same content", () => {
    expect(computeHash("foo")).toBe(computeHash("foo"));
  });

  it("returns different hashes for different content", () => {
    expect(computeHash("foo")).not.toBe(computeHash("bar"));
  });
});

describe("Manifest", () => {
  it("starts with no files recorded", () => {
    const m = new Manifest("0.5.0");
    expect(Object.keys(m.files)).toHaveLength(0);
  });

  it("records a file with its hash and generator name", () => {
    const m = new Manifest("0.5.0");
    m.record("server/index.ts", "const app = new Elysia()", "BackendGenerator");
    expect(m.hasFile("server/index.ts")).toBe(true);
    const entry = m.getEntry("server/index.ts");
    expect(entry?.generator).toBe("BackendGenerator");
    expect(entry?.hash).toBe(computeHash("const app = new Elysia()"));
  });

  it("hasFile returns false for untracked files", () => {
    const m = new Manifest("0.5.0");
    expect(m.hasFile("server/unknown.ts")).toBe(false);
  });

  it("getEntry returns undefined for untracked files", () => {
    const m = new Manifest("0.5.0");
    expect(m.getEntry("server/unknown.ts")).toBeUndefined();
  });

  it("exposes the version", () => {
    const m = new Manifest("0.5.0");
    expect(m.version).toBe("0.5.0");
  });

  it("saves manifest.json to .vasp/ directory", () => {
    const m = new Manifest("0.5.0");
    m.record("server/index.ts", "content", "BackendGenerator");
    m.save(TMP_DIR);
    const manifestPath = join(TMP_DIR, ".vasp", "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const data = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(data.version).toBe("0.5.0");
    expect(data.files["server/index.ts"]).toBeDefined();
  });

  it("load returns null when no manifest exists", () => {
    const result = Manifest.load(TMP_DIR);
    expect(result).toBeNull();
  });

  it("round-trips via save and load", () => {
    const m = new Manifest("0.5.0");
    m.record("src/index.ts", "hello", "FrontendGenerator");
    m.record("server/index.ts", "world", "BackendGenerator");
    m.save(TMP_DIR);

    const loaded = Manifest.load(TMP_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe("0.5.0");
    expect(loaded!.hasFile("src/index.ts")).toBe(true);
    expect(loaded!.hasFile("server/index.ts")).toBe(true);
    expect(loaded!.getEntry("src/index.ts")?.generator).toBe(
      "FrontendGenerator",
    );
    expect(loaded!.getEntry("server/index.ts")?.generator).toBe(
      "BackendGenerator",
    );
  });

  it("records the correct hash for each file", () => {
    const m = new Manifest("0.5.0");
    const content = "const x = 1";
    m.record("file.ts", content, "TestGenerator");
    expect(m.getEntry("file.ts")?.hash).toBe(computeHash(content));
  });

  it("overwrites an existing entry when the same path is recorded twice", () => {
    const m = new Manifest("0.5.0");
    m.record("server/index.ts", "v1", "BackendGenerator");
    m.record("server/index.ts", "v2", "BackendGenerator");
    expect(m.getEntry("server/index.ts")?.hash).toBe(computeHash("v2"));
  });
});

describe("Manifest — schemaSnapshot", () => {
  it("getSchemaSnapshot returns undefined when no snapshot has been set", () => {
    const m = new Manifest("0.5.0");
    expect(m.getSchemaSnapshot()).toBeUndefined();
  });

  it("setSchemaSnapshot / getSchemaSnapshot round-trips in memory", () => {
    const m = new Manifest("0.5.0");
    const snapshot = {
      entities: {
        Todo: {
          fields: {
            title: { type: "String", nullable: false },
            done: { type: "Boolean", nullable: false },
          },
        },
      },
    };
    m.setSchemaSnapshot(snapshot);
    expect(m.getSchemaSnapshot()).toEqual(snapshot);
  });

  it("schema snapshot persists through save/load", () => {
    const m = new Manifest("0.5.0");
    const snapshot = {
      entities: {
        Post: {
          fields: {
            title: { type: "String", nullable: false },
            authorId: { type: "Int", nullable: false },
          },
        },
      },
    };
    m.setSchemaSnapshot(snapshot);
    m.save(TMP_DIR);

    const loaded = Manifest.load(TMP_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.getSchemaSnapshot()).toEqual(snapshot);
  });

  it("load returns undefined schemaSnapshot for manifests that pre-date snapshot support", () => {
    // Write a manifest JSON without a schemaSnapshot field (old format)
    const dir = join(TMP_DIR, "legacy");
    mkdirSync(join(dir, ".vasp"), { recursive: true });
    writeFileSync(
      join(dir, ".vasp", "manifest.json"),
      JSON.stringify({ version: "0.1.0", generatedAt: "2024-01-01T00:00:00.000Z", files: {} }),
      "utf8",
    );
    const loaded = Manifest.load(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.getSchemaSnapshot()).toBeUndefined();
  });
});
