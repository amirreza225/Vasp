import type { SeedNode } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseSeed(ctx: IParserContext): SeedNode {
  const loc = ctx.consume(TokenType.KW_SEED).loc;
  ctx.consume(TokenType.LBRACE);

  let fn = null;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "fn":
        fn = ctx.parseImportExpression();
        break;
      default:
        throw ctx.error(
          "E041_UNKNOWN_PROP",
          `Unknown seed property '${key.value}'`,
          "Valid properties: fn",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!fn) {
    throw ctx.error(
      "E042_MISSING_FN",
      "Seed block is missing fn",
      'Add: fn: import seedData from "@src/seed.js"',
      loc,
    );
  }

  return { type: "Seed", fn, loc };
}
