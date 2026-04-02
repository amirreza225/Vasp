import { describe, expect, it } from "vitest";
import { drizzleColumn } from "./drizzleColumn.js";

describe("drizzleColumn — field-type mapping", () => {
  it("maps String to text()", () => {
    expect(drizzleColumn("title", "String", [])).toMatch(/^text\('title'\)/);
  });

  it("maps Text to text()", () => {
    expect(drizzleColumn("body", "Text", [])).toMatch(/^text\('body'\)/);
  });

  it("maps Int to integer() for non-PK fields", () => {
    expect(drizzleColumn("count", "Int", [])).toMatch(/^integer\('count'\)/);
  });

  it("maps Float to doublePrecision()", () => {
    expect(drizzleColumn("price", "Float", [])).toMatch(
      /^doublePrecision\('price'\)/,
    );
  });

  it("maps Boolean to boolean()", () => {
    expect(drizzleColumn("active", "Boolean", [])).toMatch(
      /^boolean\('active'\)/,
    );
  });

  it("maps DateTime to timestamp()", () => {
    expect(drizzleColumn("createdAt", "DateTime", [])).toMatch(
      /^timestamp\('createdAt'\)/,
    );
  });

  it("maps Json to jsonb()", () => {
    expect(drizzleColumn("meta", "Json", [])).toMatch(/^jsonb\('meta'\)/);
  });

  it("maps File to text()", () => {
    expect(drizzleColumn("avatar", "File", [])).toMatch(/^text\('avatar'\)/);
  });

  it("falls back to text() for unknown type", () => {
    expect(drizzleColumn("x", "Unknown", [])).toMatch(/^text\('x'\)/);
  });
});

describe("drizzleColumn — primary key", () => {
  it("Int @id uses identity column with .primaryKey().generatedByDefaultAsIdentity()", () => {
    const col = drizzleColumn("id", "Int", ["id"]);
    expect(col).toBe(
      "integer('id').primaryKey().generatedByDefaultAsIdentity()",
    );
  });

  it("non-Int @id adds .primaryKey() without identity", () => {
    const col = drizzleColumn("id", "String", ["id"]);
    expect(col).toContain(".primaryKey()");
    expect(col).not.toContain("generatedByDefaultAsIdentity");
  });
});

describe("drizzleColumn — notNull / nullable", () => {
  it("adds .notNull() for non-PK fields by default", () => {
    const col = drizzleColumn("title", "String", []);
    expect(col).toContain(".notNull()");
  });

  it("omits .notNull() when nullable=true", () => {
    const col = drizzleColumn("body", "Text", [], true);
    expect(col).not.toContain(".notNull()");
  });

  it('omits .notNull() when modifiers include "nullable"', () => {
    const col = drizzleColumn("body", "Text", ["nullable"]);
    expect(col).not.toContain(".notNull()");
  });

  it("PK columns never get .notNull()", () => {
    const col = drizzleColumn("id", "Int", ["id"]);
    expect(col).not.toContain(".notNull()");
  });
});

describe("drizzleColumn — unique", () => {
  it('adds .unique() when modifiers include "unique"', () => {
    const col = drizzleColumn("email", "String", ["unique"]);
    expect(col).toContain(".unique()");
  });

  it("does not add .unique() without the modifier", () => {
    const col = drizzleColumn("email", "String", []);
    expect(col).not.toContain(".unique()");
  });
});

describe("drizzleColumn — default values", () => {
  it('adds .defaultNow() for modifier "default_now"', () => {
    const col = drizzleColumn("createdAt", "DateTime", ["default_now"]);
    expect(col).toContain(".defaultNow()");
  });

  it('adds .defaultNow() when defaultValue is "now"', () => {
    const col = drizzleColumn("createdAt", "DateTime", [], false, "now");
    expect(col).toContain(".defaultNow()");
  });

  it("adds quoted .default() for String type", () => {
    const col = drizzleColumn("status", "String", [], false, "draft");
    expect(col).toContain(".default('draft')");
  });

  it("adds unquoted .default() for Int type", () => {
    const col = drizzleColumn("count", "Int", [], false, "0");
    expect(col).toContain(".default(0)");
  });

  it("adds unquoted .default() for Boolean type", () => {
    const col = drizzleColumn("active", "Boolean", [], false, "false");
    expect(col).toContain(".default(false)");
  });
});

describe("drizzleColumn — updatedAt", () => {
  it("adds .$onUpdate() when isUpdatedAt=true", () => {
    const col = drizzleColumn(
      "updatedAt",
      "DateTime",
      [],
      false,
      undefined,
      true,
    );
    expect(col).toContain(".$onUpdate(() => new Date())");
  });

  it('adds .$onUpdate() when modifiers include "updatedAt"', () => {
    const col = drizzleColumn("updatedAt", "DateTime", ["updatedAt"]);
    expect(col).toContain(".$onUpdate(() => new Date())");
  });

  it("does not add .$onUpdate() by default", () => {
    const col = drizzleColumn("name", "String", []);
    expect(col).not.toContain("$onUpdate");
  });
});

describe("drizzleColumn — camelCase field names", () => {
  it("converts snake_case field names to camelCase in column call", () => {
    const col = drizzleColumn("first_name", "String", []);
    expect(col).toContain("text('firstName')");
  });

  it("converts kebab-case field names to camelCase in column call", () => {
    const col = drizzleColumn("created-at", "DateTime", []);
    expect(col).toContain("timestamp('createdAt')");
  });
});

describe("drizzleColumn — combined modifiers", () => {
  it("unique + notNull combined on a String field", () => {
    const col = drizzleColumn("slug", "String", ["unique"]);
    expect(col).toContain(".notNull()");
    expect(col).toContain(".unique()");
  });

  it("nullable + unique omits .notNull() but keeps .unique()", () => {
    const col = drizzleColumn("code", "String", ["unique"], true);
    expect(col).not.toContain(".notNull()");
    expect(col).toContain(".unique()");
  });

  it("default_now + updatedAt combined", () => {
    const col = drizzleColumn("updatedAt", "DateTime", [
      "default_now",
      "updatedAt",
    ]);
    expect(col).toContain(".defaultNow()");
    expect(col).toContain(".$onUpdate(() => new Date())");
  });
});
