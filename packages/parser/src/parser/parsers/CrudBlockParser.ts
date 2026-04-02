import type {
  CrudColumnConfig,
  CrudFormConfig,
  CrudFormLayout,
  CrudFormSection,
  CrudListConfig,
  CrudNode,
  CrudOperation,
  CrudPermissions,
} from "@vasp-framework/core";
import { SUPPORTED_FORM_LAYOUTS } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";
import { parsePermissionName } from "./AuthBlockParser.js";

export function parseCrudListConfig(ctx: IParserContext): CrudListConfig {
  ctx.consume(TokenType.LBRACE);

  let paginate = false;
  let sortable: string[] = [];
  let filterable: string[] = [];
  let search: string[] = [];
  let columns: Record<string, CrudColumnConfig> | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "paginate":
        paginate = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      case "sortable":
        sortable = ctx.parseIdentifierArray();
        break;
      case "filterable":
        filterable = ctx.parseIdentifierArray();
        break;
      case "search":
        search = ctx.parseIdentifierArray();
        break;
      case "columns":
        columns = parseCrudColumnConfigMap(ctx);
        break;
      default:
        throw ctx.error(
          "E021_UNKNOWN_PROP",
          `Unknown list property '${key.value}'`,
          "Valid properties: paginate, sortable, filterable, search, columns",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return {
    paginate,
    sortable,
    filterable,
    search,
    ...(columns !== undefined ? { columns } : {}),
  };
}

/**
 * Parses the `columns: { fieldName { … } … }` sub-block inside a `list:` config.
 * Each entry is `fieldName { label: "...", width: "...", sortable: bool, filterable: bool, hidden: bool }`.
 */
export function parseCrudColumnConfigMap(
  ctx: IParserContext,
): Record<string, CrudColumnConfig> {
  ctx.consume(TokenType.LBRACE);
  const result: Record<string, CrudColumnConfig> = {};

  while (!ctx.check(TokenType.RBRACE)) {
    const colName = ctx.consumeIdentifier().value;
    ctx.consume(TokenType.LBRACE);
    const colCfg: CrudColumnConfig = {};

    while (!ctx.check(TokenType.RBRACE)) {
      const propKey = ctx.consumeIdentifier();
      ctx.consume(TokenType.COLON);

      switch (propKey.value) {
        case "label":
          colCfg.label = ctx.consumeString();
          break;
        case "width":
          colCfg.width = ctx.consumeString();
          break;
        case "sortable":
          colCfg.sortable = ctx.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "filterable":
          colCfg.filterable = ctx.consume(TokenType.BOOLEAN).value === "true";
          break;
        case "hidden":
          colCfg.hidden = ctx.consume(TokenType.BOOLEAN).value === "true";
          break;
        default:
          throw ctx.error(
            "E173_UNKNOWN_COLUMN_CONFIG_PROP",
            `Unknown column config property '${propKey.value}' for column '${colName}'`,
            "Valid properties: label, width, sortable, filterable, hidden",
            propKey.loc,
          );
      }
      if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
    }

    ctx.consume(TokenType.RBRACE);
    result[colName] = colCfg;
  }

  ctx.consume(TokenType.RBRACE);
  return result;
}

/**
 * Parses the `form: { layout, sections, steps }` sub-block inside a `crud` block.
 *
 * Sections (for non-wizard layouts):
 *   sections: { sectionName { label: "...", fields: [f1, f2] } ... }
 *
 * Steps (for wizard layout):
 *   steps: { stepName { label: "...", fields: [f1, f2] } ... }
 */
export function parseCrudFormConfig(ctx: IParserContext): CrudFormConfig {
  ctx.consume(TokenType.LBRACE);
  const formCfg: CrudFormConfig = {};

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "layout": {
        const layoutTok = ctx.consumeString();
        if (!(SUPPORTED_FORM_LAYOUTS as readonly string[]).includes(layoutTok)) {
          throw ctx.error(
            "E174_INVALID_FORM_LAYOUT",
            `Invalid form layout '${layoutTok}'`,
            `Valid layouts: ${SUPPORTED_FORM_LAYOUTS.join(", ")}`,
            key.loc,
          );
        }
        formCfg.layout = layoutTok as CrudFormLayout;
        break;
      }
      case "sections":
        formCfg.sections = parseCrudFormSectionMap(ctx, "section");
        break;
      case "steps":
        formCfg.steps = parseCrudFormSectionMap(ctx, "step");
        break;
      default:
        throw ctx.error(
          "E175_UNKNOWN_FORM_CONFIG_PROP",
          `Unknown form config property '${key.value}'`,
          "Valid properties: layout, sections, steps",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return formCfg;
}

/**
 * Parses a map of named form sections or steps:
 *   { sectionName { label: "...", fields: [f1, f2] } ... }
 *
 * @param kind - "section" or "step" used in error messages
 */
export function parseCrudFormSectionMap(
  ctx: IParserContext,
  kind: string,
): Record<string, CrudFormSection> {
  ctx.consume(TokenType.LBRACE);
  const result: Record<string, CrudFormSection> = {};

  while (!ctx.check(TokenType.RBRACE)) {
    const sectionName = ctx.consumeIdentifier().value;
    ctx.consume(TokenType.LBRACE);
    const section: CrudFormSection = { fields: [] };

    while (!ctx.check(TokenType.RBRACE)) {
      const propKey = ctx.consumeIdentifier();
      ctx.consume(TokenType.COLON);

      switch (propKey.value) {
        case "label":
          section.label = ctx.consumeString();
          break;
        case "fields":
          section.fields = ctx.parseIdentifierArray();
          break;
        default:
          throw ctx.error(
            "E176_UNKNOWN_FORM_SECTION_PROP",
            `Unknown ${kind} property '${propKey.value}' for '${sectionName}'`,
            "Valid properties: label, fields",
            propKey.loc,
          );
      }
      if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
    }

    ctx.consume(TokenType.RBRACE);
    result[sectionName] = section;
  }

  ctx.consume(TokenType.RBRACE);
  return result;
}

/**
 * Parses the crud `permissions` block:
 *   { list: task:read  create: task:create  delete: task:delete }
 *
 * Keys are simple operation names; values are permission names (may be
 * namespaced, e.g. "task:read").
 */
export function parseCrudPermissionsMap(
  ctx: IParserContext,
): CrudPermissions {
  ctx.consume(TokenType.LBRACE);
  const result: CrudPermissions = {};

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier().value;
    ctx.consume(TokenType.COLON);
    const permissionName = parsePermissionName(ctx);
    result[key] = permissionName;
    if (ctx.check(TokenType.COMMA)) {
      ctx.consume(TokenType.COMMA);
    }
  }

  ctx.consume(TokenType.RBRACE);
  return result;
}

export function parseCrud(ctx: IParserContext): CrudNode {
  const loc = ctx.consume(TokenType.KW_CRUD).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let entity = "";
  let operations: CrudOperation[] = [];
  let listConfig: CrudListConfig | undefined;
  let formConfig: CrudFormConfig | undefined;
  let permissions: CrudPermissions | undefined;
  let ownership: string | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "entity":
        entity = ctx.consumeIdentifier().value;
        break;
      case "operations":
        operations = ctx.parseIdentifierArray() as CrudOperation[];
        break;
      case "list":
        listConfig = parseCrudListConfig(ctx);
        break;
      case "form":
        formConfig = parseCrudFormConfig(ctx);
        break;
      case "permissions":
        permissions = parseCrudPermissionsMap(ctx);
        break;
      case "ownership":
        ownership = ctx.consumeIdentifier().value;
        break;
      default:
        throw ctx.error(
          "E021_UNKNOWN_PROP",
          `Unknown crud property '${key.value}'`,
          "Valid properties: entity, operations, list, form, permissions, ownership",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return {
    type: "Crud",
    name: name.value,
    loc,
    entity,
    operations,
    ...(listConfig !== undefined ? { listConfig } : {}),
    ...(formConfig !== undefined ? { formConfig } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
    ...(ownership !== undefined ? { ownership } : {}),
  };
}
