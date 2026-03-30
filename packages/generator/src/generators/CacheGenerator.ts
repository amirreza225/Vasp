import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase } from "../template/TemplateEngine.js";

export class CacheGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    const caches = ast.caches ?? [];
    if (caches.length === 0) return;

    this.ctx.logger.info("Generating cache stores...");

    for (const cache of caches) {
      const isRedisLike =
        cache.provider === "redis" || cache.provider === "valkey";
      const templateKey = isRedisLike
        ? "shared/server/cache/_store_redis.hbs"
        : "shared/server/cache/_store.hbs";

      this.write(
        `server/cache/${toCamelCase(cache.name)}.${ext}`,
        this.render(templateKey, {
          name: cache.name,
          provider: cache.provider,
          defaultTtl: cache.ttl ?? 60,
          redisUrlEnvVar: cache.redis?.url ?? "REDIS_URL",
        }),
      );
    }

    // Write a barrel re-exporting all cache stores so tests can detect generation
    this.write(
      `server/cache/index.${ext}`,
      caches
        .map(
          (c) =>
            `export * as ${toCamelCase(c.name)} from './${toCamelCase(c.name)}.js'`,
        )
        .join("\n") + "\n",
    );
  }
}
