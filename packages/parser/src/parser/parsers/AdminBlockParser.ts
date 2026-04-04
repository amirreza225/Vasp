import type { AdminNode } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseAdmin(ctx: IParserContext): AdminNode {
  const loc = ctx.consume(TokenType.KW_ADMIN).loc;

  // The `admin` block optionally accepts a name identifier (e.g. `admin PanelName { }`).
  // If an identifier appears before the opening brace, consume and discard it — the name
  // is not used in generation but supporting it gives a friendlier experience to developers
  // who follow the pattern of every other named block (entity, route, crud, etc.).
  if (!ctx.check(TokenType.LBRACE)) {
    ctx.consumeIdentifier(); // consume and ignore optional name
  }

  ctx.consume(TokenType.LBRACE);

  let entities: string[] = [];

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "entities":
        entities = ctx.parseIdentifierArray();
        break;
      default:
        throw ctx.error(
          "E047_UNKNOWN_PROP",
          `Unknown admin property '${key.value}'`,
          "Valid properties: entities",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  return { type: "Admin", entities, loc };
}
