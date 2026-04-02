import type {
  FieldValidateConfig,
  FieldValidation,
} from "@vasp-framework/core";

/**
 * Effective validation shape used internally by `valibotSchema()`.
 * Combines properties from both `FieldValidation` (the `@validate()` modifier)
 * and `FieldValidateConfig` (the nested `validate { }` config block).
 */
interface MergedFieldValidation {
  // From FieldValidation (@validate modifier)
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
  // Shared — FieldValidateConfig takes precedence
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  // From FieldValidateConfig only
  /** When present, overrides the `optional` parameter: true → required, false → optional */
  required?: boolean;
  /** Regex pattern string — adds v.regex() for String/Text fields */
  pattern?: string;
}

/**
 * Merges `FieldValidation` (from `@validate()`) with `FieldValidateConfig`
 * (from the nested `validate {}` config block). When both are present,
 * `configValidate` takes precedence for overlapping numeric constraints
 * (`minLength`, `maxLength`, `min`, `max`).
 *
 * @param validation    - from `field.validation` (@validate modifier)
 * @param configValidate - from `field.config.validate` (v2 DSL config block)
 */
export function mergeFieldValidation(
  validation?: FieldValidation,
  configValidate?: FieldValidateConfig,
): MergedFieldValidation | undefined {
  if (!validation && !configValidate) return undefined;

  const merged: MergedFieldValidation = {};

  // Properties that exist only in FieldValidation
  if (validation?.email) merged.email = validation.email;
  if (validation?.url) merged.url = validation.url;
  if (validation?.uuid) merged.uuid = validation.uuid;

  // Overlapping numeric constraints — configValidate takes precedence
  const minLength = configValidate?.minLength ?? validation?.minLength;
  const maxLength = configValidate?.maxLength ?? validation?.maxLength;
  const min = configValidate?.min ?? validation?.min;
  const max = configValidate?.max ?? validation?.max;
  if (minLength != null) merged.minLength = minLength;
  if (maxLength != null) merged.maxLength = maxLength;
  if (min != null) merged.min = min;
  if (max != null) merged.max = max;

  // Properties that exist only in FieldValidateConfig
  if (configValidate?.required !== undefined)
    merged.required = configValidate.required;
  if (configValidate?.pattern !== undefined)
    merged.pattern = configValidate.pattern;

  return merged;
}

/** Returns true if the value looks like a Handlebars options object. */
function isHandlebarsOptions(v: unknown): v is { hash: unknown } {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "hash" in (v as object)
  );
}

/**
 * Maps a Vasp field type + nullability + validation rules to a Valibot schema
 * expression string.
 *
 * Extracted from the `valibotSchema` Handlebars helper so that the mapping
 * logic can be unit-tested directly without going through template rendering.
 *
 * @param fieldType      - Vasp primitive type (String, Text, Int, Float, Boolean,
 *                         DateTime, Json, Enum, File) or a relation entity name.
 * @param nullable       - whether the field accepts null.
 * @param optional       - whether the field is optional (v.optional wrapper).
 * @param enumValues     - array of string literals for Enum fields.
 * @param validation     - field-level validation rules from the @validate modifier.
 * @param configValidate - field-level validation from the nested `validate {}` config block.
 *                         Takes precedence over `validation` for overlapping constraints.
 */
export function valibotSchema(
  fieldType: string,
  nullable?: boolean,
  optional?: boolean | string,
  enumValues?: unknown,
  validation?: unknown,
  configValidate?: unknown,
): string {
  const isNullable = nullable === true;

  // Strip Handlebars options objects passed as validation/configValidate
  const rawValidation =
    validation != null &&
    typeof validation === "object" &&
    !Array.isArray(validation) &&
    !isHandlebarsOptions(validation)
      ? (validation as FieldValidation)
      : undefined;

  const rawConfigValidate =
    configValidate != null &&
    typeof configValidate === "object" &&
    !Array.isArray(configValidate) &&
    !isHandlebarsOptions(configValidate)
      ? (configValidate as FieldValidateConfig)
      : undefined;

  // Merge both validation sources; config.validate takes precedence
  const vld = mergeFieldValidation(rawValidation, rawConfigValidate);

  // config.validate.required overrides the optional parameter when present
  let isOptional: boolean;
  if (vld?.required !== undefined) {
    isOptional = !vld.required;
  } else {
    isOptional = optional === true || optional === "true";
  }

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

    // Regex pattern constraint (from config.validate.pattern)
    // Use new RegExp(string) instead of a /literal/ so that forward slashes, backslashes,
    // and other special characters in the pattern are all safely handled by JSON.stringify().
    if (vld?.pattern) {
      parts.push(`v.regex(new RegExp(${JSON.stringify(vld.pattern)}))`);
    }

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
