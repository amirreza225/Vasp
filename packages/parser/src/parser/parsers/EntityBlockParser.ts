import type {
  EntityFieldConfig,
  EntityIndex,
  EntityIndexType,
  EntityNode,
  EntityUniqueConstraint,
  FieldModifier,
  FieldNode,
  FieldValidateConfig,
  FieldValidation,
  OnDeleteBehavior,
} from "@vasp-framework/core";
import { SUPPORTED_FIELD_TYPES } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

/**
 * Parse the raw content of a @validate(...) modifier into a FieldValidation object.
 * Examples:
 *   "email"                         → { email: true }
 *   "minLength: 3, maxLength: 30"   → { minLength: 3, maxLength: 30 }
 *   "email, minLength: 5"           → { email: true, minLength: 5 }
 *   "min: 0, max: 100"              → { min: 0, max: 100 }
 */
function parseValidateArgs(raw: string): FieldValidation {
  const validation: FieldValidation = {};
  const rules = raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  for (const rule of rules) {
    const colonIdx = rule.indexOf(":");
    if (colonIdx === -1) {
      // Boolean flag: email | url | uuid
      const flag = rule.trim();
      if (flag === "email") validation.email = true;
      else if (flag === "url") validation.url = true;
      else if (flag === "uuid") validation.uuid = true;
    } else {
      // Numeric key-value: minLength: 3 | maxLength: 100 | min: 0 | max: 255
      const key = rule.slice(0, colonIdx).trim();
      const value = rule.slice(colonIdx + 1).trim();
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        if (key === "minLength") validation.minLength = numValue;
        else if (key === "maxLength") validation.maxLength = numValue;
        else if (key === "min") validation.min = numValue;
        else if (key === "max") validation.max = numValue;
      }
    }
  }

  return validation;
}

/**
 * Parses the field-level config block declared after `fieldName: Type @modifiers`:
 *
 *   title: String {
 *     label:       "Task Title"
 *     placeholder: "Enter a name…"
 *     description: "Shown in the form tooltip"
 *     default:     "Untitled"
 *     validate: {
 *       required:  true
 *       minLength: 3
 *       maxLength: 120
 *       min:       0
 *       max:       999
 *       pattern:   "[a-z]+"
 *       custom:    "@src/validators/title.js"
 *     }
 *   }
 */
function parseFieldConfigBlock(
  ctx: IParserContext,
  fieldName: string,
): EntityFieldConfig {
  ctx.consume(TokenType.LBRACE);
  const config: EntityFieldConfig = {};

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "label":
        config.label = ctx.consumeString();
        break;
      case "placeholder":
        config.placeholder = ctx.consumeString();
        break;
      case "description":
        config.description = ctx.consumeString();
        break;
      case "default": {
        const tok = ctx.peek();
        if (tok.type === TokenType.STRING) {
          config.default = ctx.consumeString();
        } else if (tok.type === TokenType.NUMBER) {
          config.default = Number(ctx.consume(TokenType.NUMBER).value);
        } else if (tok.type === TokenType.BOOLEAN) {
          config.default = ctx.consume(TokenType.BOOLEAN).value === "true";
        } else {
          throw ctx.error(
            "E170_INVALID_FIELD_CONFIG_DEFAULT",
            `Invalid default value for field '${fieldName}': expected string, number, or boolean`,
            'Example: default: "Untitled" or default: 0 or default: false',
            tok.loc,
          );
        }
        break;
      }
      case "validate": {
        ctx.consume(TokenType.LBRACE);
        const validate: FieldValidateConfig = {};

        while (!ctx.check(TokenType.RBRACE)) {
          const ruleKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);

          switch (ruleKey.value) {
            case "required":
              validate.required =
                ctx.consume(TokenType.BOOLEAN).value === "true";
              break;
            case "minLength":
              validate.minLength = Number(ctx.consume(TokenType.NUMBER).value);
              break;
            case "maxLength":
              validate.maxLength = Number(ctx.consume(TokenType.NUMBER).value);
              break;
            case "min":
              validate.min = Number(ctx.consume(TokenType.NUMBER).value);
              break;
            case "max":
              validate.max = Number(ctx.consume(TokenType.NUMBER).value);
              break;
            case "pattern":
              validate.pattern = ctx.consumeString();
              break;
            case "custom":
              validate.custom = ctx.consumeString();
              break;
            default:
              throw ctx.error(
                "E171_UNKNOWN_VALIDATE_CONFIG_PROP",
                `Unknown validate property '${ruleKey.value}' for field '${fieldName}'`,
                "Valid properties: required, minLength, maxLength, min, max, pattern, custom",
                ruleKey.loc,
              );
          }
          if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
        }

        ctx.consume(TokenType.RBRACE);
        config.validate = validate;
        break;
      }
      default:
        throw ctx.error(
          "E172_UNKNOWN_FIELD_CONFIG_PROP",
          `Unknown field config property '${key.value}' for field '${fieldName}'`,
          "Valid properties: label, placeholder, description, default, validate",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return config;
}

export function parseEntity(ctx: IParserContext): EntityNode {
  const loc = ctx.consume(TokenType.KW_ENTITY).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  // Primitive types recognized by the parser — entity names accepted for relations
  const primitiveTypes = new Set<string>(SUPPORTED_FIELD_TYPES);

  const fields: FieldNode[] = [];
  const indexes: EntityIndex[] = [];
  const uniqueConstraints: EntityUniqueConstraint[] = [];
  let versioned = false;

  while (!ctx.check(TokenType.RBRACE)) {
    // Table-level directives: @@index([fields]), @@index([fields], type: fulltext), @@unique([fields])
    if (ctx.check(TokenType.AT_AT_DIRECTIVE)) {
      const directive = ctx.consume(TokenType.AT_AT_DIRECTIVE);
      if (directive.value === "index") {
        ctx.consume(TokenType.LPAREN);
        ctx.consume(TokenType.LBRACKET);
        const indexFields: string[] = [];
        while (!ctx.check(TokenType.RBRACKET)) {
          indexFields.push(ctx.consumeIdentifier().value);
          if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
        }
        ctx.consume(TokenType.RBRACKET);
        if (indexFields.length === 0) {
          throw ctx.error(
            "E165_EMPTY_INDEX_FIELDS",
            `@@index on entity '${name.value}' must specify at least one field`,
            "Example: @@index([field1, field2])",
            directive.loc,
          );
        }
        let indexType: EntityIndexType | undefined;
        if (ctx.check(TokenType.COMMA)) {
          ctx.consume(TokenType.COMMA);
          const typeKey = ctx.consumeIdentifier();
          if (typeKey.value !== "type") {
            throw ctx.error(
              "E166_UNKNOWN_INDEX_OPTION",
              `Unknown @@index option '${typeKey.value}'`,
              "Valid options: type",
              typeKey.loc,
            );
          }
          ctx.consume(TokenType.COLON);
          const typeVal = ctx.consumeIdentifier();
          if (typeVal.value === "fulltext") {
            indexType = "fulltext";
          } else {
            throw ctx.error(
              "E167_UNKNOWN_INDEX_TYPE",
              `Unknown @@index type '${typeVal.value}'`,
              "Valid types: fulltext",
              typeVal.loc,
            );
          }
        }
        ctx.consume(TokenType.RPAREN);
        indexes.push({
          fields: indexFields,
          ...(indexType ? { type: indexType } : {}),
        });
        continue;
      } else if (directive.value === "unique") {
        ctx.consume(TokenType.LPAREN);
        ctx.consume(TokenType.LBRACKET);
        const uniqueFields: string[] = [];
        while (!ctx.check(TokenType.RBRACKET)) {
          uniqueFields.push(ctx.consumeIdentifier().value);
          if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
        }
        ctx.consume(TokenType.RBRACKET);
        if (uniqueFields.length === 0) {
          throw ctx.error(
            "E168_EMPTY_UNIQUE_FIELDS",
            `@@unique on entity '${name.value}' must specify at least one field`,
            "Example: @@unique([field1, field2])",
            directive.loc,
          );
        }
        ctx.consume(TokenType.RPAREN);
        uniqueConstraints.push({ fields: uniqueFields });
        continue;
      } else if (directive.value === "versioned") {
        // @@versioned — no arguments, just a flag
        versioned = true;
        continue;
      } else {
        throw ctx.error(
          "E169_UNKNOWN_TABLE_DIRECTIVE",
          `Unknown table directive '@@${directive.value}'`,
          "Valid table directives: @@index, @@unique, @@versioned",
          directive.loc,
        );
      }
    }

    const fieldName = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);
    const fieldTypeToken = ctx.consumeIdentifier();
    const fieldTypeStr = fieldTypeToken.value;

    // Parse Enum variant list: Enum(active, inactive, archived)
    let enumValues: string[] | undefined;
    if (fieldTypeStr === "Enum") {
      ctx.consume(TokenType.LPAREN);
      enumValues = [];
      const seenVariants = new Set<string>();
      while (!ctx.check(TokenType.RPAREN)) {
        const variant = ctx.consumeIdentifier();
        if (seenVariants.has(variant.value)) {
          throw ctx.error(
            "E150_DUPLICATE_ENUM_VARIANT",
            `Duplicate enum variant '${variant.value}' in field '${fieldName.value}'`,
            "Each enum variant must be unique",
            variant.loc,
          );
        }
        seenVariants.add(variant.value);
        enumValues.push(variant.value);
        if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
      }
      ctx.consume(TokenType.RPAREN);
      if (enumValues.length === 0) {
        throw ctx.error(
          "E141_EMPTY_ENUM",
          `Enum field '${fieldName.value}' must have at least one variant`,
          "Example: status: Enum(active, inactive, archived)",
          fieldTypeToken.loc,
        );
      }
    }

    // Detect [] suffix — marks this as an array relation (virtual, no column)
    let isArray = false;
    if (ctx.check(TokenType.LBRACKET)) {
      ctx.consume(TokenType.LBRACKET);
      ctx.consume(TokenType.RBRACKET);
      isArray = true;
    }

    const isRelation = !primitiveTypes.has(fieldTypeStr);

    // Parse modifiers (@id, @unique, @default(...), @nullable, @updatedAt, @onDelete(...), @validate(...), @manyToMany, @storage(...))
    const modifiers: FieldModifier[] = [];
    let nullable = false;
    let defaultValue: string | undefined;
    let onDelete: OnDeleteBehavior | undefined;
    let isUpdatedAt = false;
    let fieldValidation: FieldValidation | undefined;
    let isManyToMany = false;
    let storageBlock: string | undefined;
    let isHidden = false;

    while (ctx.check(TokenType.AT_MODIFIER)) {
      const mod = ctx.consume(TokenType.AT_MODIFIER);
      const modVal = mod.value;

      if (modVal === "id") {
        modifiers.push("id");
      } else if (modVal === "unique") {
        modifiers.push("unique");
      } else if (modVal === "default_now") {
        modifiers.push("default_now");
        defaultValue = "now";
      } else if (modVal === "nullable") {
        nullable = true;
        modifiers.push("nullable");
      } else if (modVal === "updatedAt") {
        isUpdatedAt = true;
        modifiers.push("updatedAt");
      } else if (modVal === "manyToMany") {
        isManyToMany = true;
      } else if (modVal === "hidden") {
        isHidden = true;
        modifiers.push("hidden");
      } else if (modVal.startsWith("default_")) {
        defaultValue = modVal.slice("default_".length);
      } else if (modVal.startsWith("onDelete_")) {
        const raw = modVal.slice("onDelete_".length);
        onDelete = (raw === "setNull" ? "set null" : raw) as OnDeleteBehavior;
      } else if (modVal.startsWith("validate_")) {
        fieldValidation = parseValidateArgs(modVal.slice("validate_".length));
      } else if (modVal.startsWith("storage_")) {
        storageBlock = modVal.slice("storage_".length);
      }
      // Unknown modifiers are silently ignored (forward-compat)
    }

    const field: FieldNode = {
      name: fieldName.value,
      type: fieldTypeStr,
      modifiers,
      isRelation,
      isArray,
      nullable,
      isUpdatedAt,
    };
    if (isRelation) field.relatedEntity = fieldTypeStr;
    if (defaultValue !== undefined) field.defaultValue = defaultValue;
    if (onDelete !== undefined) field.onDelete = onDelete;
    if (enumValues !== undefined) field.enumValues = enumValues;
    if (fieldValidation !== undefined) field.validation = fieldValidation;
    if (isManyToMany) field.isManyToMany = true;
    if (storageBlock !== undefined) field.storageBlock = storageBlock;
    if (isHidden) field.isHidden = true;

    // v2 field config block: fieldName: Type @modifiers { label: "...", ... }
    if (ctx.check(TokenType.LBRACE)) {
      field.config = parseFieldConfigBlock(ctx, fieldName.value);
    }

    fields.push(field);
  }

  ctx.consume(TokenType.RBRACE);
  return {
    type: "Entity",
    name: name.value,
    loc,
    fields,
    ...(indexes.length > 0 ? { indexes } : {}),
    ...(uniqueConstraints.length > 0 ? { uniqueConstraints } : {}),
    ...(versioned ? { versioned: true } : {}),
  };
}
