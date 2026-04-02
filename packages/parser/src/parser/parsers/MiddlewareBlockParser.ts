import type { MiddlewareNode, MiddlewareScope } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseMiddleware(ctx: IParserContext): MiddlewareNode {
  const loc = ctx.consume(TokenType.KW_MIDDLEWARE).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let fn = null;
  let scope = "global" as MiddlewareScope;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "fn":
        fn = ctx.parseImportExpression();
        break;
      case "scope":
        scope = ctx.consumeIdentifier().value as MiddlewareScope;
        break;
      default:
        throw ctx.error(
          "E036_UNKNOWN_PROP",
          `Unknown middleware property '${key.value}'`,
          "Valid properties: fn, scope",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!fn) {
    throw ctx.error(
      "E037_MISSING_FN",
      `Middleware '${name.value}' is missing fn`,
      'Add: fn: import logger from "@src/middleware/logger.js"',
      loc,
    );
  }

  return { type: "Middleware", name: name.value, loc, fn, scope };
}
