import type { RealtimeEvent, RealtimeNode } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseRealtime(ctx: IParserContext): RealtimeNode {
  const loc = ctx.consume(TokenType.KW_REALTIME).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let entity = "";
  let events: RealtimeEvent[] = [];

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "entity":
        entity = ctx.consumeIdentifier().value;
        break;
      case "events":
        events = ctx.parseIdentifierArray() as RealtimeEvent[];
        break;
      default:
        throw ctx.error(
          "E022_UNKNOWN_PROP",
          `Unknown realtime property '${key.value}'`,
          "Valid properties: entity, events",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return { type: "Realtime", name: name.value, loc, entity, events };
}
