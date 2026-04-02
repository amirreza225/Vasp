import type { ApiMethod, ApiNode } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseApi(ctx: IParserContext): ApiNode {
  const loc = ctx.consume(TokenType.KW_API).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let method = "GET" as ApiMethod;
  let path = "";
  let fn = null;
  let auth = false;
  let roles: string[] = [];

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "method":
        method = ctx.consumeIdentifier().value.toUpperCase() as ApiMethod;
        break;
      case "path":
        path = ctx.consumeString();
        break;
      case "fn":
        fn = ctx.parseImportExpression();
        break;
      case "auth":
        auth = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      case "roles":
        roles = ctx.parseIdentifierArray();
        break;
      default:
        throw ctx.error(
          "E033_UNKNOWN_PROP",
          `Unknown api property '${key.value}'`,
          "Valid properties: method, path, fn, auth, roles",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!fn) {
    throw ctx.error(
      "E034_MISSING_FN",
      `Api '${name.value}' is missing fn`,
      'Add: fn: import { myHandler } from "@src/api.js"',
      loc,
    );
  }

  if (!path) {
    throw ctx.error(
      "E035_MISSING_PATH",
      `Api '${name.value}' is missing path`,
      'Add: path: "/api/my-endpoint"',
      loc,
    );
  }

  if (!path.startsWith("/")) {
    throw ctx.error(
      "E047_INVALID_API_PATH",
      `Api '${name.value}' path must start with '/'`,
      'Example: path: "/api/my-endpoint"',
      loc,
    );
  }

  return {
    type: "Api",
    name: name.value,
    loc,
    method,
    path,
    fn,
    auth,
    ...(roles.length > 0 ? { roles } : {}),
  };
}
