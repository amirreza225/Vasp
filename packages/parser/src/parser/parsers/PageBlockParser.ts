import type { PageNode } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parsePage(ctx: IParserContext): PageNode {
  const loc = ctx.consume(TokenType.KW_PAGE).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let component = null;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "component":
        component = ctx.parseImportExpression();
        break;
      default:
        throw ctx.error(
          "E015_UNKNOWN_PROP",
          `Unknown page property '${key.value}'`,
          "Valid properties: component",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!component) {
    throw ctx.error(
      "E016_MISSING_COMPONENT",
      `Page '${name.value}' is missing a component`,
      'Add: component: import Foo from "@src/pages/Foo.vue"',
      loc,
    );
  }

  return { type: "Page", name: name.value, loc, component };
}
