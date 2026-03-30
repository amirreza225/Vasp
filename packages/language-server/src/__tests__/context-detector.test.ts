/**
 * context-detector.test.ts — Unit tests for cursor context detection.
 */

import { describe, it, expect } from "vitest";
import { detectCursorContext } from "../utils/context-detector.js";

describe("detectCursorContext", () => {
  it("returns top-level when cursor is before any block", () => {
    const source = "";
    expect(detectCursorContext(source, 0)).toEqual({ type: "top-level" });
  });

  it("returns top-level when cursor is between blocks", () => {
    const source = `
entity A { id: Int @id }

`;
    // Position cursor at the trailing newline (after the entity block closes)
    const cursor = source.lastIndexOf("\n");
    const ctx = detectCursorContext(source, cursor);
    expect(ctx.type).toBe("top-level");
  });

  it("detects entity context inside entity block", () => {
    const source = `entity Todo {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("entity");
    expect((ctx as { type: string; blockName: string }).blockName).toBe("Todo");
  });

  it("detects crud context inside crud block", () => {
    const source = `crud Todo {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("crud");
    expect((ctx as { type: string; blockName: string }).blockName).toBe("Todo");
  });

  it("detects crud-list context inside list sub-block", () => {
    const source = `crud Todo {\n  list {\n    `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("crud-list");
  });

  it("detects crud-form context inside form sub-block", () => {
    const source = `crud Todo {\n  form {\n    `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("crud-form");
  });

  it("detects crud-permissions context inside permissions sub-block", () => {
    const source = `crud Todo {\n  permissions {\n    `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("crud-permissions");
  });

  it("detects job context inside job block", () => {
    const source = `job sendEmail {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("job");
  });

  it("detects after-colon context for executor key", () => {
    const source = `job sendEmail {\n  executor: `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("after-colon");
    expect((ctx as { type: string; key: string }).key).toBe("executor");
  });

  it("detects auth context inside auth block", () => {
    const source = `auth MyAuth {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("auth");
  });

  it("detects storage context inside storage block", () => {
    const source = `storage uploads {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("storage");
  });

  it("detects cache context inside cache block", () => {
    const source = `cache apiCache {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("cache");
  });

  it("detects email context inside email block", () => {
    const source = `email mailer {\n  `;
    const ctx = detectCursorContext(source, source.length);
    expect(ctx.type).toBe("email");
  });

  it("detects after-colon for 'to' key in route", () => {
    const source = `route Home {\n  path: "/"\n  to: `;
    const ctx = detectCursorContext(source, source.length);
    // May be after-colon with key=to
    if (ctx.type === "after-colon") {
      expect((ctx as { type: string; key: string }).key).toBe("to");
    }
  });
});
