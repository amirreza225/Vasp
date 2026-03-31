import type { FieldValidation } from "@vasp-framework/core";
import { GeneratorError } from "@vasp-framework/core";
import Handlebars from "handlebars";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

type TemplateDelegate = HandlebarsTemplateDelegate<unknown>;

export class TemplateEngine {
  private readonly cache = new Map<string, TemplateDelegate>();
  private readonly hbs: typeof Handlebars;

  constructor() {
    this.hbs = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Pre-compile all .hbs files found under a directory tree.
   * Call this once per generation run to warm the cache.
   */
  loadDirectory(dir: string): void {
    this.walkHbs(dir, (filePath) => {
      const key = relative(dir, filePath);
      const source = readFileSync(filePath, "utf8");
      try {
        this.cache.set(key, this.hbs.compile(source));
      } catch (err) {
        throw new GeneratorError(
          `Failed to compile template ${key}: ${String(err)}`,
          "TemplateEngine",
        );
      }
    });
  }

  /**
   * Render a template by its key (relative path from the template root).
   */
  render(key: string, data: Record<string, unknown>): string {
    const tmpl = this.cache.get(key);
    if (!tmpl) {
      throw new GeneratorError(
        `Template not found: '${key}'`,
        "TemplateEngine",
      );
    }
    return tmpl(data);
  }

  /**
   * Render an inline Handlebars string (used for testing helpers).
   */
  renderString(source: string, data: Record<string, unknown>): string {
    return this.hbs.compile(source)(data);
  }

  /**
   * Returns true if a template key exists in the cache.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** All loaded template keys */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  // ---- Helpers ----

  private registerHelpers(): void {
    this.hbs.registerHelper("camelCase", (str: string) => toCamelCase(str));
    this.hbs.registerHelper("pascalCase", (str: string) => toPascalCase(str));
    this.hbs.registerHelper("kebabCase", (str: string) => toKebabCase(str));
    this.hbs.registerHelper("lowerCase", (str: string) => str.toLowerCase());
    this.hbs.registerHelper("upperCase", (str: string) => str.toUpperCase());
    this.hbs.registerHelper("plural", (str: string) => toPlural(str));

    this.hbs.registerHelper("join", (arr: string[], sep: string) => {
      if (!Array.isArray(arr)) return "";
      return arr.join(typeof sep === "string" ? sep : ", ");
    });

    /** Rewrites @src/foo.js → @src/foo.ts when isTypeScript is true */
    this.hbs.registerHelper("importPath", (source: string, ext: string) => {
      if (ext === "ts" && source.endsWith(".js")) {
        return source.slice(0, -3) + ".ts";
      }
      return source;
    });

    /** eq helper for {{#if (eq a b)}} */
    this.hbs.registerHelper("eq", (a: unknown, b: unknown) => a === b);

    /** includes helper: {{#if (includes arr item)}} */
    this.hbs.registerHelper(
      "includes",
      (arr: unknown[], item: unknown) =>
        Array.isArray(arr) && arr.includes(item),
    );

    /** or helper: {{#if (or a b c)}} — returns true if any argument is truthy */
    this.hbs.registerHelper("or", (...args: unknown[]) => {
      args.pop(); // remove Handlebars options object
      return args.some(Boolean);
    });

    /** importName: extracts the exported name from an ImportExpression */
    this.hbs.registerHelper(
      "importName",
      (imp: { kind: string; defaultExport?: string; namedExport?: string }) => {
        return imp.kind === "default"
          ? (imp.defaultExport ?? "")
          : (imp.namedExport ?? "");
      },
    );

    /** tsFieldType: maps a Vasp field type to a TypeScript type string */
    this.hbs.registerHelper(
      "tsFieldType",
      (fieldType: string, enumValues?: unknown) => {
        if (
          fieldType === "Enum" &&
          Array.isArray(enumValues) &&
          enumValues.length > 0
        ) {
          return enumValues.map((v: string) => `'${v}'`).join(" | ");
        }
        const tsMap: Record<string, string> = {
          String: "string",
          Text: "string",
          Int: "number",
          Float: "number",
          Boolean: "boolean",
          DateTime: "Date",
          Json: "unknown",
          File: "string",
        };
        return tsMap[fieldType] ?? fieldType;
      },
    );

    /** valibotSchema: maps a Vasp field type + nullability + validation rules to a Valibot schema expression */
    this.hbs.registerHelper(
      "valibotSchema",
      (
        fieldType: string,
        nullable?: boolean,
        optional?: unknown,
        enumValues?: unknown,
        validation?: unknown,
      ) => {
        const isNullable = nullable === true;
        const isOptional = optional === true || optional === "true";
        // validation may come from Handlebars template context (FieldValidation object or undefined)
        const vld =
          validation &&
          typeof validation === "object" &&
          !Array.isArray(validation) &&
          !("hash" in (validation as object))
            ? (validation as FieldValidation)
            : undefined;

        let base: string;
        if (
          fieldType === "Enum" &&
          Array.isArray(enumValues) &&
          enumValues.length > 0
        ) {
          const items = enumValues.map((v: string) => `'${v}'`).join(", ");
          base = `v.picklist([${items}])`;
        } else if (fieldType === "DateTime") {
          // Validate that the string is non-empty and parses to a valid Date before transforming.
          // For nullable fields use v.union so that null is accepted but empty strings are rejected.
          const validDate = `v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))`;
          if (isNullable) {
            const schema = `v.union([v.null(), ${validDate}])`;
            return isOptional ? `v.optional(${schema})` : schema;
          }
          return isOptional ? `v.optional(${validDate})` : validDate;
        } else if (fieldType === "String" || fieldType === "Text") {
          // Build a v.pipe() chain from the base string validator + any declared rules
          const parts: string[] = ["v.string()"];

          // Format validators (mutually exclusive: email, url, uuid)
          if (vld?.email) parts.push("v.email()");
          else if (vld?.url) parts.push("v.url()");
          else if (vld?.uuid) parts.push("v.uuid()");

          // Length constraints
          if (vld?.minLength != null) {
            parts.push(`v.minLength(${vld.minLength})`);
          } else {
            // Default: all strings must be non-empty unless user overrides minLength
            parts.push("v.minLength(1)");
          }
          if (vld?.maxLength != null)
            parts.push(`v.maxLength(${vld.maxLength})`);

          base = parts.length > 1 ? `v.pipe(${parts.join(", ")})` : parts[0]!;
        } else if (fieldType === "Int" || fieldType === "Float") {
          // Build a v.pipe() chain for numeric types
          const parts: string[] = ["v.number()"];
          if (vld?.min != null) parts.push(`v.minValue(${vld.min})`);
          if (vld?.max != null) parts.push(`v.maxValue(${vld.max})`);
          base = parts.length > 1 ? `v.pipe(${parts.join(", ")})` : parts[0]!;
        } else {
          const baseMap: Record<string, string> = {
            Boolean: "v.boolean()",
            Json: "v.unknown()",
          };
          base = baseMap[fieldType] ?? "v.unknown()";
        }

        if (nullable) {
          return isOptional
            ? `v.optional(v.nullable(${base}))`
            : `v.nullable(${base})`;
        }

        return isOptional ? `v.optional(${base})` : base;
      },
    );

    /** lookup: returns obj[key] — mirrors Handlebars built-in for sandboxed create() instances */
    this.hbs.registerHelper(
      "lookup",
      (obj: Record<string, unknown>, key: unknown) => {
        if (obj == null || typeof key !== "string") return undefined;
        return obj[key];
      },
    );

    /** drizzleColumn: maps a FieldType + modifiers to a Drizzle column call string */
    this.hbs.registerHelper(
      "drizzleColumn",
      (
        fieldName: string,
        fieldType: string,
        modifiers: string[],
        nullable?: boolean,
        defaultValue?: string,
        isUpdatedAt?: boolean,
      ) => {
        const typeMap: Record<string, string> = {
          String: "text",
          Text: "text",
          Int: "integer",
          Boolean: "boolean",
          DateTime: "timestamp",
          Float: "doublePrecision",
          Json: "jsonb",
          File: "text",
        };
        const drizzleFn = typeMap[fieldType] ?? "text";
        let col = `${drizzleFn}('${toCamelCase(fieldName)}')`;
        if (Array.isArray(modifiers)) {
          if (modifiers.includes("id")) {
            // Use identity column for auto-incrementing integer primary keys
            if (fieldType === "Int") {
              col = `integer('${toCamelCase(fieldName)}').primaryKey().generatedByDefaultAsIdentity()`;
            } else {
              col += ".primaryKey()";
            }
          } else {
            // Non-PK columns: notNull by default unless @nullable
            if (!nullable && !modifiers.includes("nullable"))
              col += ".notNull()";
            if (modifiers.includes("unique")) col += ".unique()";
            if (modifiers.includes("default_now") || defaultValue === "now") {
              col += ".defaultNow()";
            } else if (defaultValue !== undefined && defaultValue !== "now") {
              const isString = fieldType === "String" || fieldType === "Text";
              col += isString
                ? `.default('${defaultValue}')`
                : `.default(${defaultValue})`;
            }
            if (isUpdatedAt || modifiers.includes("updatedAt")) {
              col += ".$onUpdate(() => new Date())";
            }
          }
        }
        return col;
      },
    );
  }

  private walkHbs(dir: string, fn: (path: string) => void): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // directory doesn't exist yet — skip silently
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        this.walkHbs(full, fn);
      } else if (extname(full) === ".hbs") {
        fn(full);
      }
    }
  }
}

// ---- String transform utilities ----

export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase());
}

export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "-$1")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/^-/, "");
}

/**
 * Pluralises an English word using a small set of rules + common irregular forms.
 * Input is expected to be a camelCase identifier (e.g. "category", "person").
 */
export function toPlural(word: string): string {
  if (!word) return word;

  const lower = word.toLowerCase();

  // Irregular plurals — keyed by singular lowercase form
  const irregulars: Record<string, string> = {
    person: "people",
    man: "men",
    woman: "women",
    child: "children",
    tooth: "teeth",
    foot: "feet",
    mouse: "mice",
    goose: "geese",
    ox: "oxen",
    leaf: "leaves",
    life: "lives",
    knife: "knives",
    wife: "wives",
    half: "halves",
    loaf: "loaves",
    cactus: "cacti",
    focus: "foci",
    fungus: "fungi",
    nucleus: "nuclei",
    syllabus: "syllabi",
    analysis: "analyses",
    diagnosis: "diagnoses",
    parenthesis: "parentheses",
    thesis: "theses",
    crisis: "crises",
    phenomenon: "phenomena",
    criterion: "criteria",
    datum: "data",
    medium: "media",
    index: "indices",
    matrix: "matrices",
    vertex: "vertices",
  };

  if (lower in irregulars) return irregulars[lower]!;

  // Words ending in s, x, z, ch, sh → add es
  if (/(?:s|x|z|ch|sh)$/.test(lower)) return word + "es";

  // Words ending in consonant + y → replace y with ies
  if (/[^aeiou]y$/.test(lower)) return word.slice(0, -1) + "ies";

  // Default → add s
  return word + "s";
}
