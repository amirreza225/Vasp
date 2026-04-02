import type {
  AutoPageLayout,
  AutoPageNode,
  AutoPageRowAction,
  AutoPageTopAction,
  AutoPageType,
} from "@vasp-framework/core";
import { SUPPORTED_AUTOPAGE_TYPES } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseAutoPage(ctx: IParserContext): AutoPageNode {
  const loc = ctx.consume(TokenType.KW_AUTOPAGE).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let entity = "";
  let path = "";
  let pageType: AutoPageType | null = null;
  let title: string | undefined;
  let columns: string[] | undefined;
  let sortable: string[] | undefined;
  let filterable: string[] | undefined;
  let searchable: string[] | undefined;
  let paginate: boolean | undefined;
  let pageSize: number | undefined;
  let rowActions: AutoPageRowAction[] | undefined;
  let topActions: AutoPageTopAction[] | undefined;
  let fields: string[] | undefined;
  let layout: AutoPageLayout | undefined;
  let submitAction: string | undefined;
  let successRoute: string | undefined;
  let auth: boolean | undefined;
  let roles: string[] | undefined;

  while (!ctx.check(TokenType.RBRACE) && !ctx.isEOF()) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "entity":
        entity = ctx.consumeIdentifier().value;
        break;
      case "path":
        path = ctx.consumeString();
        break;
      case "type": {
        const typeTok = ctx.consumeIdentifier();
        if (
          !(SUPPORTED_AUTOPAGE_TYPES as readonly string[]).includes(
            typeTok.value,
          )
        ) {
          throw ctx.error(
            "E_AUTOPAGE_INVALID_TYPE",
            `Invalid autoPage type '${typeTok.value}'`,
            `Valid values: ${SUPPORTED_AUTOPAGE_TYPES.join(", ")}`,
            typeTok.loc,
          );
        }
        pageType = typeTok.value as AutoPageType;
        break;
      }
      case "title":
        title = ctx.consumeString();
        break;
      case "columns":
        columns = ctx.parseIdentifierArray();
        break;
      case "sortable":
        sortable = ctx.parseIdentifierArray();
        break;
      case "filterable":
        filterable = ctx.parseIdentifierArray();
        break;
      case "searchable":
        searchable = ctx.parseIdentifierArray();
        break;
      case "paginate": {
        const bt = ctx.consume(TokenType.BOOLEAN);
        paginate = bt.value === "true";
        break;
      }
      case "pageSize": {
        const numTok = ctx.consume(TokenType.NUMBER);
        pageSize = Number(numTok.value);
        break;
      }
      case "rowActions":
        rowActions = ctx.parseIdentifierArray() as AutoPageRowAction[];
        break;
      case "topActions":
        topActions = ctx.parseIdentifierArray() as AutoPageTopAction[];
        break;
      case "fields":
        fields = ctx.parseIdentifierArray();
        break;
      case "layout":
        layout = ctx.consumeString() as AutoPageLayout;
        break;
      case "submitAction":
        submitAction = ctx.consumeIdentifier().value;
        break;
      case "successRoute":
        successRoute = ctx.consumeString();
        break;
      case "auth": {
        const at = ctx.consume(TokenType.BOOLEAN);
        auth = at.value === "true";
        break;
      }
      case "roles":
        roles = ctx.parseIdentifierArray();
        break;
      default:
        throw ctx.error(
          "E_AUTOPAGE_UNKNOWN_PROP",
          `Unknown autoPage property '${key.value}'`,
          "Valid properties: entity, path, type, title, columns, sortable, filterable, searchable, paginate, pageSize, rowActions, topActions, fields, layout, submitAction, successRoute, auth, roles",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!entity) {
    throw ctx.error(
      "E_AUTOPAGE_NO_ENTITY",
      `autoPage '${name.value}' is missing required property 'entity'`,
      "Add: entity: MyEntityName",
      loc,
    );
  }
  if (!path) {
    throw ctx.error(
      "E_AUTOPAGE_NO_PATH",
      `autoPage '${name.value}' is missing required property 'path'`,
      'Add: path: "/my-path"',
      loc,
    );
  }
  if (!pageType) {
    throw ctx.error(
      "E_AUTOPAGE_NO_TYPE",
      `autoPage '${name.value}' is missing required property 'type'`,
      `Valid values: ${SUPPORTED_AUTOPAGE_TYPES.join(", ")}`,
      loc,
    );
  }

  return {
    type: "AutoPage",
    name: name.value,
    loc,
    entity,
    path,
    pageType,
    ...(title !== undefined ? { title } : {}),
    ...(columns !== undefined ? { columns } : {}),
    ...(sortable !== undefined ? { sortable } : {}),
    ...(filterable !== undefined ? { filterable } : {}),
    ...(searchable !== undefined ? { searchable } : {}),
    ...(paginate !== undefined ? { paginate } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(rowActions !== undefined ? { rowActions } : {}),
    ...(topActions !== undefined ? { topActions } : {}),
    ...(fields !== undefined ? { fields } : {}),
    ...(layout !== undefined ? { layout } : {}),
    ...(submitAction !== undefined ? { submitAction } : {}),
    ...(successRoute !== undefined ? { successRoute } : {}),
    ...(auth !== undefined ? { auth } : {}),
    ...(roles !== undefined ? { roles } : {}),
  };
}
