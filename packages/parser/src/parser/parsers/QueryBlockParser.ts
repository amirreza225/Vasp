import type {
  QueryCacheConfig,
  QueryNode,
  SourceLocation,
} from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

/** Parses: [Entity:operation, Entity:operation, ...] for invalidateOn arrays */
export function parseInvalidateOnArray(ctx: IParserContext): string[] {
  ctx.consume(TokenType.LBRACKET);
  const items: string[] = [];

  while (!ctx.check(TokenType.RBRACKET)) {
    const entity = ctx.consumeIdentifier().value;
    ctx.consume(TokenType.COLON);
    const operation = ctx.consumeIdentifier().value;
    items.push(`${entity}:${operation}`);
    if (ctx.check(TokenType.COMMA)) {
      ctx.consume(TokenType.COMMA);
    }
  }

  ctx.consume(TokenType.RBRACKET);
  return items;
}

/** Parses the `cache: { store, ttl, key, invalidateOn }` sub-block inside a query */
export function parseQueryCacheConfig(
  ctx: IParserContext,
  loc: SourceLocation,
): QueryCacheConfig {
  ctx.consume(TokenType.LBRACE);

  let store: string | null = null;
  let ttl: number | undefined;
  let key: string | undefined;
  let invalidateOn: string[] | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const innerKey = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (innerKey.value) {
      case "store":
        store = ctx.consumeIdentifier().value;
        break;
      case "ttl": {
        const tok = ctx.consume(TokenType.NUMBER);
        ttl = Number(tok.value);
        break;
      }
      case "key":
        key = ctx.consumeString();
        break;
      case "invalidateOn":
        invalidateOn = parseInvalidateOnArray(ctx);
        break;
      default:
        throw ctx.error(
          "E074_UNKNOWN_PROP",
          `Unknown query cache property '${innerKey.value}'`,
          "Valid properties: store, ttl, key, invalidateOn",
          innerKey.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!store) {
    throw ctx.error(
      "E075_MISSING_CACHE_STORE",
      "Query cache block is missing store",
      "Add: store: MyCacheBlockName",
      loc,
    );
  }

  return {
    store,
    ...(ttl !== undefined ? { ttl } : {}),
    ...(key !== undefined ? { key } : {}),
    ...(invalidateOn !== undefined ? { invalidateOn } : {}),
  };
}

export function parseQuery(ctx: IParserContext): QueryNode {
  const loc = ctx.consume(TokenType.KW_QUERY).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let fn = null;
  let entities: string[] = [];
  let auth = false;
  let roles: string[] = [];
  let cache: QueryCacheConfig | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "fn":
        fn = ctx.parseImportExpression();
        break;
      case "entities":
        entities = ctx.parseIdentifierArray();
        break;
      case "auth":
        auth = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      case "roles":
        roles = ctx.parseIdentifierArray();
        break;
      case "cache":
        cache = parseQueryCacheConfig(ctx, key.loc);
        break;
      default:
        throw ctx.error(
          "E017_UNKNOWN_PROP",
          `Unknown query property '${key.value}'`,
          "Valid properties: fn, entities, auth, roles, cache",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!fn) {
    throw ctx.error(
      "E018_MISSING_FN",
      `Query '${name.value}' is missing fn`,
      'Add: fn: import { myFn } from "@src/queries.js"',
      loc,
    );
  }

  return {
    type: "Query",
    name: name.value,
    loc,
    fn,
    entities,
    auth,
    ...(roles.length > 0 ? { roles } : {}),
    ...(cache !== undefined ? { cache } : {}),
  };
}
