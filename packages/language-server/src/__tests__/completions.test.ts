/**
 * completions.test.ts — Unit tests for context-aware completions.
 */

import { describe, it, expect, vi } from "vitest";
import { getCompletions } from "../features/completions.js";
import type { VaspDocumentStore } from "../utils/document-store.js";

/** Minimal stub of VaspDocumentStore for completion tests */
function makeStore(entities: string[] = [], pages: string[] = []): VaspDocumentStore {
  return {
    allEntities: () => entities.map((name) => ({ name, uri: "file:///test.vasp" })),
    allPages: () => pages.map((name) => ({ name, uri: "file:///test.vasp" })),
    all: () => [],
    get: () => null,
    remove: () => undefined,
    update: () => Promise.resolve({ uri: "", version: 0, ast: { blocks: [] }, errors: [], parsedAt: 0 }),
    syncOpenDocuments: () => Promise.resolve(),
    entityFields: () => null,
  } as unknown as VaspDocumentStore;
}

describe("getCompletions — top-level", () => {
  it("returns all block type keywords at top level", () => {
    const items = getCompletions("", 0, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("app");
    expect(labels).toContain("entity");
    expect(labels).toContain("crud");
    expect(labels).toContain("auth");
    expect(labels).toContain("route");
    expect(labels).toContain("page");
    expect(labels).toContain("job");
    expect(labels).toContain("storage");
    expect(labels).toContain("email");
    expect(labels).toContain("cache");
    expect(labels).toContain("realtime");
    expect(labels).toContain("webhook");
    expect(labels).toContain("observability");
    expect(labels).toContain("autoPage");
  });

  it("top-level completions include snippet insertText", () => {
    const items = getCompletions("", 0, makeStore());
    const entityItem = items.find((i) => i.label === "entity");
    expect(entityItem?.insertText).toContain("@id");
  });
});

describe("getCompletions — inside entity block", () => {
  it("returns field type completions inside entity", () => {
    const source = "entity Todo {\n  ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("String");
    expect(labels).toContain("Int");
    expect(labels).toContain("Boolean");
    expect(labels).toContain("DateTime");
    expect(labels).toContain("Float");
    expect(labels).toContain("Text");
    expect(labels).toContain("Json");
    expect(labels).toContain("File");
    expect(labels).toContain("Enum");
  });
});

describe("getCompletions — inside crud block", () => {
  it("returns sub-block keywords inside crud", () => {
    const source = "crud Todo {\n  ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("list");
    expect(labels).toContain("form");
    expect(labels).toContain("permissions");
    expect(labels).toContain("entity");
    expect(labels).toContain("operations");
  });

  it("returns list-specific completions inside crud list block", () => {
    const source = "crud Todo {\n  list {\n    ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("paginate");
    expect(labels).toContain("sortable");
    expect(labels).toContain("filterable");
    expect(labels).toContain("search");
    expect(labels).toContain("columns");
  });

  it("returns form-specific completions inside crud form block", () => {
    const source = "crud Todo {\n  form {\n    ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("sections");
    expect(labels).toContain("steps");
    expect(labels).toContain("layout");
  });

  it("returns permission completions inside permissions block", () => {
    const source = "crud Todo {\n  permissions {\n    ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("list");
    expect(labels).toContain("create");
    expect(labels).toContain("update");
    expect(labels).toContain("delete");
  });
});

describe("getCompletions — after colon", () => {
  it("returns executor completions after 'executor:'", () => {
    const source = "job sendEmail {\n  executor: ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("PgBoss");
    expect(labels).toContain("BullMQ");
    expect(labels).toContain("RedisStreams");
    expect(labels).toContain("RabbitMQ");
    expect(labels).toContain("Kafka");
  });

  it("executor PgBoss completion has auto-insert snippet with perform block", () => {
    const source = "job sendEmail {\n  executor: ";
    const items = getCompletions(source, source.length, makeStore());
    const pgBoss = items.find((i) => i.label === "PgBoss");
    expect(pgBoss?.insertText).toContain("perform");
  });

  it("returns entity names for 'entity:' key with workspace entities", () => {
    const source = "crud Todo {\n  entity: ";
    const items = getCompletions(source, source.length, makeStore(["Todo", "User", "Post"]));
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Todo");
    expect(labels).toContain("User");
    expect(labels).toContain("Post");
  });

  it("returns page names for 'to:' key with workspace pages", () => {
    const source = "route Home {\n  to: ";
    const items = getCompletions(source, source.length, makeStore([], ["HomePage", "AboutPage"]));
    const labels = items.map((i) => i.label);
    expect(labels).toContain("HomePage");
    expect(labels).toContain("AboutPage");
  });

  it("returns storage provider options after 'provider:' in storage block", () => {
    const source = "storage uploads {\n  provider: ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("local");
    expect(labels).toContain("s3");
    expect(labels).toContain("r2");
    expect(labels).toContain("gcs");
  });

  it("returns email provider options after 'provider:' in email block", () => {
    const source = "email mailer {\n  provider: ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("resend");
    expect(labels).toContain("sendgrid");
    expect(labels).toContain("smtp");
  });

  it("returns cache provider options after 'provider:' in cache block", () => {
    const source = "cache apiCache {\n  provider: ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("memory");
    expect(labels).toContain("redis");
    expect(labels).toContain("valkey");
  });

  it("returns exporter options for observability exporter", () => {
    const source = "observability ops {\n  exporter: ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("console");
    expect(labels).toContain("otlp");
    expect(labels).toContain("prometheus");
  });
});

describe("getCompletions — job block", () => {
  it("returns job-specific completions inside job block", () => {
    const source = "job sendEmail {\n  ";
    const items = getCompletions(source, source.length, makeStore());
    const labels = items.map((i) => i.label);
    expect(labels).toContain("executor");
    expect(labels).toContain("perform");
    expect(labels).toContain("schedule");
    expect(labels).toContain("retries");
  });
});
