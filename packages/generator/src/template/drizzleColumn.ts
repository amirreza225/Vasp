import { toCamelCase } from "./TemplateEngine.js";

/**
 * Maps a Vasp field type + modifiers to a Drizzle ORM column call string.
 *
 * Extracted from the `drizzleColumn` Handlebars helper so that the mapping
 * logic can be unit-tested directly without going through template rendering.
 */
export function drizzleColumn(
  fieldName: string,
  fieldType: string,
  modifiers: string[],
  nullable?: boolean,
  defaultValue?: string,
  isUpdatedAt?: boolean,
): string {
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
      if (!nullable && !modifiers.includes("nullable")) col += ".notNull()";
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
}
