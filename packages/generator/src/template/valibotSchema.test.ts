import { describe, expect, it } from "vitest";
import { valibotSchema } from "./valibotSchema.js";

// Reusable constant for the validated-date pipe expression
const VALID_DATE =
  "v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))";

// ---- Field-type mapping (required, non-nullable, non-optional) ----

describe("valibotSchema — basic field-type mapping", () => {
  it("maps String to a non-empty pipe", () => {
    expect(valibotSchema("String")).toBe("v.pipe(v.string(), v.minLength(1))");
  });

  it("maps Text to a non-empty pipe", () => {
    expect(valibotSchema("Text")).toBe("v.pipe(v.string(), v.minLength(1))");
  });

  it("maps Int to v.number()", () => {
    expect(valibotSchema("Int")).toBe("v.number()");
  });

  it("maps Float to v.number()", () => {
    expect(valibotSchema("Float")).toBe("v.number()");
  });

  it("maps Boolean to v.boolean()", () => {
    expect(valibotSchema("Boolean")).toBe("v.boolean()");
  });

  it("maps Json to v.unknown()", () => {
    expect(valibotSchema("Json")).toBe("v.unknown()");
  });

  it("maps File to a non-empty pipe", () => {
    expect(valibotSchema("File")).toBe("v.pipe(v.string(), v.minLength(1))");
  });

  it("maps unknown types to v.unknown()", () => {
    expect(valibotSchema("SomeEntity")).toBe("v.unknown()");
  });

  it("maps DateTime to the validated pipe+transform", () => {
    expect(valibotSchema("DateTime")).toBe(VALID_DATE);
  });
});

// ---- Enum ----

describe("valibotSchema — Enum", () => {
  it("generates v.picklist() for Enum with values", () => {
    expect(valibotSchema("Enum", false, false, ["draft", "published"])).toBe(
      "v.picklist(['draft', 'published'])",
    );
  });

  it("falls back to v.unknown() for Enum with no values", () => {
    expect(valibotSchema("Enum", false, false, [])).toBe("v.unknown()");
  });

  it("wraps nullable Enum with v.nullable()", () => {
    expect(valibotSchema("Enum", true, false, ["a", "b"])).toBe(
      "v.nullable(v.picklist(['a', 'b']))",
    );
  });

  it("wraps optional Enum with v.optional()", () => {
    expect(valibotSchema("Enum", false, true, ["a", "b"])).toBe(
      "v.optional(v.picklist(['a', 'b']))",
    );
  });

  it("wraps nullable + optional Enum correctly", () => {
    expect(valibotSchema("Enum", true, true, ["a", "b"])).toBe(
      "v.optional(v.nullable(v.picklist(['a', 'b'])))",
    );
  });
});

// ---- DateTime special handling ----

describe("valibotSchema — DateTime", () => {
  it("required DateTime returns the validated pipe", () => {
    expect(valibotSchema("DateTime")).toBe(VALID_DATE);
  });

  it("nullable DateTime wraps in v.union([v.null(), ...])", () => {
    expect(valibotSchema("DateTime", true)).toBe(
      `v.union([v.null(), ${VALID_DATE}])`,
    );
  });

  it("optional DateTime wraps in v.optional(...)", () => {
    expect(valibotSchema("DateTime", false, true)).toBe(
      `v.optional(${VALID_DATE})`,
    );
  });

  it("nullable + optional DateTime wraps in v.optional(v.union(...))", () => {
    expect(valibotSchema("DateTime", true, true)).toBe(
      `v.optional(v.union([v.null(), ${VALID_DATE}]))`,
    );
  });
});

// ---- Nullable / optional wrappers ----

describe("valibotSchema — nullable / optional wrappers", () => {
  it("wraps nullable String with v.nullable()", () => {
    expect(valibotSchema("String", true)).toBe(
      "v.nullable(v.pipe(v.string(), v.minLength(1)))",
    );
  });

  it("wraps optional Int with v.optional()", () => {
    expect(valibotSchema("Int", false, true)).toBe("v.optional(v.number())");
  });

  it("wraps nullable + optional Boolean with both wrappers", () => {
    expect(valibotSchema("Boolean", true, true)).toBe(
      "v.optional(v.nullable(v.boolean()))",
    );
  });

  it('accepts optional as the string "true"', () => {
    expect(valibotSchema("Int", false, "true")).toBe("v.optional(v.number())");
  });

  it('does not treat optional string "false" as optional', () => {
    expect(valibotSchema("Int", false, "false")).toBe("v.number()");
  });
});

// ---- String / Text validation rules ----

describe("valibotSchema — String/Text validation rules", () => {
  it("includes v.email() for email validation", () => {
    const result = valibotSchema("String", false, false, undefined, {
      email: true,
    });
    expect(result).toBe("v.pipe(v.string(), v.email(), v.minLength(1))");
  });

  it("includes v.url() for url validation", () => {
    const result = valibotSchema("String", false, false, undefined, {
      url: true,
    });
    expect(result).toBe("v.pipe(v.string(), v.url(), v.minLength(1))");
  });

  it("includes v.uuid() for uuid validation", () => {
    const result = valibotSchema("String", false, false, undefined, {
      uuid: true,
    });
    expect(result).toBe("v.pipe(v.string(), v.uuid(), v.minLength(1))");
  });

  it("uses explicit minLength when provided (overrides default 1)", () => {
    const result = valibotSchema("String", false, false, undefined, {
      minLength: 3,
    });
    expect(result).toContain("v.minLength(3)");
    expect(result).not.toMatch(/v\.minLength\(1\)/);
  });

  it("allows minLength: 0 (empty strings permitted)", () => {
    const result = valibotSchema("String", false, false, undefined, {
      minLength: 0,
    });
    expect(result).toContain("v.minLength(0)");
    expect(result).not.toMatch(/v\.minLength\(1\)/);
  });

  it("includes v.maxLength() when maxLength is provided", () => {
    const result = valibotSchema("String", false, false, undefined, {
      maxLength: 30,
    });
    expect(result).toContain("v.maxLength(30)");
  });

  it("includes both minLength and maxLength when both are provided", () => {
    const result = valibotSchema("String", false, false, undefined, {
      minLength: 3,
      maxLength: 30,
    });
    expect(result).toBe(
      "v.pipe(v.string(), v.minLength(3), v.maxLength(30))",
    );
  });

  it("nullable String with email validation wraps in v.nullable()", () => {
    const result = valibotSchema("String", true, false, undefined, {
      email: true,
    });
    expect(result).toContain("v.nullable(");
    expect(result).toContain("v.email()");
  });

  it("produces default pipe for String with no validation object", () => {
    expect(valibotSchema("String", false, false, undefined, undefined)).toBe(
      "v.pipe(v.string(), v.minLength(1))",
    );
  });
});

// ---- Int / Float validation rules ----

describe("valibotSchema — Int/Float validation rules", () => {
  it("includes v.minValue() when min is provided for Int", () => {
    const result = valibotSchema("Int", false, false, undefined, { min: 0 });
    expect(result).toContain("v.minValue(0)");
  });

  it("includes v.maxValue() when max is provided for Int", () => {
    const result = valibotSchema("Int", false, false, undefined, { max: 100 });
    expect(result).toContain("v.maxValue(100)");
  });

  it("generates full pipe for Int with both min and max", () => {
    const result = valibotSchema("Int", false, false, undefined, {
      min: 0,
      max: 100,
    });
    expect(result).toBe("v.pipe(v.number(), v.minValue(0), v.maxValue(100))");
  });

  it("includes v.minValue() when min is provided for Float", () => {
    const result = valibotSchema("Float", false, false, undefined, {
      min: 0.5,
    });
    expect(result).toContain("v.minValue(0.5)");
  });

  it("returns bare v.number() for Int with no validation", () => {
    expect(valibotSchema("Int")).toBe("v.number()");
  });

  it("wraps nullable Int+validation with v.nullable()", () => {
    const result = valibotSchema("Int", true, false, undefined, { min: 1 });
    expect(result).toContain("v.nullable(");
    expect(result).toContain("v.minValue(1)");
  });
});

// ---- Handlebars options object guard ----

describe("valibotSchema — Handlebars options guard", () => {
  it("ignores a Handlebars options object (has hash property) passed as validation", () => {
    // Simulates Handlebars calling the helper with an extra options argument
    const handlebarsOptions = { hash: {}, fn: () => "" };
    expect(valibotSchema("String", false, false, undefined, handlebarsOptions)).toBe(
      "v.pipe(v.string(), v.minLength(1))",
    );
  });
});
