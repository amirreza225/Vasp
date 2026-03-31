import type { FieldValidation } from "@vasp-framework/core";

/**
 * Maps a Vasp field type + nullability + validation rules to a Valibot schema
 * expression string.
 *
 * Extracted from the `valibotSchema` Handlebars helper so that the mapping
 * logic can be unit-tested directly without going through template rendering.
 *
 * @param fieldType  - Vasp primitive type (String, Text, Int, Float, Boolean,
 *                     DateTime, Json, Enum, File) or a relation entity name.
 * @param nullable   - whether the field accepts null.
 * @param optional   - whether the field is optional (v.optional wrapper).
 * @param enumValues - array of string literals for Enum fields.
 * @param validation - field-level validation rules (@validate modifier).
 */
export function valibotSchema(
  fieldType: string,
  nullable?: boolean,
  optional?: boolean | string,
  enumValues?: unknown,
  validation?: unknown,
): string {
  const isNullable = nullable === true;
  const isOptional = optional === true || optional === "true";
  // Strip Handlebars options object (has a `hash` property) so callers from
  // Handlebars helpers that forward the raw options object are handled safely.
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
    const items = (enumValues as string[]).map((v) => `'${v}'`).join(", ");
    base = `v.picklist([${items}])`;
  } else if (fieldType === "DateTime") {
    // Validate that the string is non-empty and parses to a valid Date before
    // transforming. For nullable fields use v.union so that null is accepted
    // but empty strings are rejected.
    const validDate = `v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))`;
    if (isNullable) {
      const schema = `v.union([v.null(), ${validDate}])`;
      return isOptional ? `v.optional(${schema})` : schema;
    }
    return isOptional ? `v.optional(${validDate})` : validDate;
  } else if (fieldType === "String" || fieldType === "Text") {
    // Build a v.pipe() chain from the base string validator + any declared rules.
    const parts: string[] = ["v.string()"];

    // Format validators (mutually exclusive: email, url, uuid)
    if (vld?.email) parts.push("v.email()");
    else if (vld?.url) parts.push("v.url()");
    else if (vld?.uuid) parts.push("v.uuid()");

    // Length constraints
    if (vld?.minLength != null) {
      parts.push(`v.minLength(${vld.minLength})`);
    } else {
      // Default: all strings must be non-empty unless the user overrides minLength
      parts.push("v.minLength(1)");
    }
    if (vld?.maxLength != null) parts.push(`v.maxLength(${vld.maxLength})`);

    base = parts.length > 1 ? `v.pipe(${parts.join(", ")})` : parts[0]!;
  } else if (fieldType === "Int" || fieldType === "Float") {
    // Build a v.pipe() chain for numeric types.
    const parts: string[] = ["v.number()"];
    if (vld?.min != null) parts.push(`v.minValue(${vld.min})`);
    if (vld?.max != null) parts.push(`v.maxValue(${vld.max})`);
    base = parts.length > 1 ? `v.pipe(${parts.join(", ")})` : parts[0]!;
  } else {
    const baseMap: Record<string, string> = {
      Boolean: "v.boolean()",
      Json: "v.unknown()",
      File: "v.pipe(v.string(), v.minLength(1))",
    };
    base = baseMap[fieldType] ?? "v.unknown()";
  }

  if (isNullable) {
    return isOptional
      ? `v.optional(v.nullable(${base}))`
      : `v.nullable(${base})`;
  }

  return isOptional ? `v.optional(${base})` : base;
}
