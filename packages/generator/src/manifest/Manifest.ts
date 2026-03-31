import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ManifestEntry {
  hash: string;
  generator: string;
}

/**
 * A snapshot of a single DB column as it was last generated.
 * Used to detect destructive schema changes on the next `vasp generate` run.
 */
export interface FieldSnapshot {
  /** Drizzle column type ('String', 'Int', 'Boolean', …) */
  type: string;
  /** Whether the column allows NULL */
  nullable: boolean;
}

/** All column snapshots for a single DB table. */
export interface EntitySnapshot {
  /** Maps DB column name → FieldSnapshot */
  fields: Record<string, FieldSnapshot>;
}

/**
 * Lightweight representation of the generated Drizzle schema, persisted into
 * `.vasp/manifest.json` next to the file-hash entries.  On each regeneration,
 * `DrizzleSchemaGenerator` compares the *previous* snapshot against the *new*
 * AST so that potentially-destructive changes (column drops, type changes,
 * table drops) can be surfaced as warnings before `vasp db push` runs.
 */
export interface SchemaSnapshot {
  /** Maps entity name (PascalCase, as in the DSL) → EntitySnapshot */
  entities: Record<string, EntitySnapshot>;
}

export interface ManifestData {
  version: string;
  generatedAt: string;
  files: Record<string, ManifestEntry>;
  /** Schema snapshot captured after the last successful generation. Optional for backward compat. */
  schemaSnapshot?: SchemaSnapshot;
}

const MANIFEST_DIR = ".vasp";
const MANIFEST_FILE = "manifest.json";

export class Manifest {
  private data: ManifestData;

  constructor(version: string) {
    this.data = {
      version,
      generatedAt: new Date().toISOString(),
      files: {},
    };
  }

  /** Record a generated file with its content hash and source generator. */
  record(relativePath: string, content: string, generator: string): void {
    this.data.files[relativePath] = {
      hash: computeHash(content),
      generator,
    };
  }

  /** Get the manifest entry for a given file path. */
  getEntry(relativePath: string): ManifestEntry | undefined {
    return this.data.files[relativePath];
  }

  /** Check whether a file was tracked in this manifest. */
  hasFile(relativePath: string): boolean {
    return relativePath in this.data.files;
  }

  /** Set a manifest entry directly (used when merging manifests during selective regeneration). */
  setEntry(relativePath: string, entry: ManifestEntry): void {
    this.data.files[relativePath] = entry;
  }

  /** All tracked files. */
  get files(): Record<string, ManifestEntry> {
    return this.data.files;
  }

  /** The Vasp version used for this generation. */
  get version(): string {
    return this.data.version;
  }

  /** Store the Drizzle schema snapshot after a successful generation. */
  setSchemaSnapshot(snapshot: SchemaSnapshot): void {
    this.data.schemaSnapshot = snapshot;
  }

  /**
   * Retrieve the schema snapshot from the previous generation.
   * Returns `undefined` when the manifest pre-dates schema snapshot support.
   */
  getSchemaSnapshot(): SchemaSnapshot | undefined {
    return this.data.schemaSnapshot;
  }

  /** Persist the manifest to `.vasp/manifest.json` in the output directory. */
  save(outputDir: string): void {
    const manifestDir = join(outputDir, MANIFEST_DIR);
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, MANIFEST_FILE),
      JSON.stringify(this.data, null, 2),
      "utf8",
    );
  }

  /** Load an existing manifest from an output directory. Returns null if none exists. */
  static load(outputDir: string): Manifest | null {
    const manifestPath = join(outputDir, MANIFEST_DIR, MANIFEST_FILE);
    if (!existsSync(manifestPath)) return null;
    const raw = readFileSync(manifestPath, "utf8");
    const data = JSON.parse(raw) as ManifestData;
    const manifest = new Manifest(data.version);
    manifest.data = data;
    return manifest;
  }
}

/** Compute a SHA-256 hex digest of the given content. */
export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
