import type {
  CacheNode,
  CacheProvider,
  CacheRedisConfig,
} from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseCache(ctx: IParserContext): CacheNode {
  const loc = ctx.consume(TokenType.KW_CACHE).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let provider: CacheProvider | null = null;
  let ttl: number | undefined;
  let redis: CacheRedisConfig | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "provider":
        provider = ctx.consumeIdentifier().value as CacheProvider;
        break;
      case "ttl": {
        const tok = ctx.consume(TokenType.NUMBER);
        ttl = Number(tok.value);
        break;
      }
      case "redis": {
        ctx.consume(TokenType.LBRACE);
        let redisUrl: string | null = null;
        while (!ctx.check(TokenType.RBRACE)) {
          const innerKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          if (innerKey.value === "url") {
            redisUrl = ctx.parseEnvRef();
          } else {
            throw ctx.error(
              "E072_UNKNOWN_PROP",
              `Unknown redis property '${innerKey.value}'`,
              "Valid properties: url",
              innerKey.loc,
            );
          }
        }
        ctx.consume(TokenType.RBRACE);
        if (!redisUrl) {
          throw ctx.error(
            "E073_MISSING_REDIS_URL",
            `cache '${name.value}' redis block is missing url`,
            "Add: url: env(REDIS_URL)",
            key.loc,
          );
        }
        redis = { url: redisUrl };
        break;
      }
      default:
        throw ctx.error(
          "E071_UNKNOWN_PROP",
          `Unknown cache property '${key.value}'`,
          "Valid properties: provider, ttl, redis",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!provider) {
    throw ctx.error(
      "E070_MISSING_CACHE_PROVIDER",
      `Cache block '${name.value}' is missing a provider`,
      "Add: provider: memory (or redis, valkey)",
      loc,
    );
  }

  return {
    type: "Cache",
    name: name.value,
    loc,
    provider,
    ...(ttl !== undefined ? { ttl } : {}),
    ...(redis !== undefined ? { redis } : {}),
  };
}
