import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase } from "../template/TemplateEngine.js";

export class StorageGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    const storages = ast.storages ?? [];
    if (storages.length === 0) return;

    this.ctx.logger.info("Generating storage providers...");

    for (const storage of storages) {
      const isCloud = ["s3", "r2", "gcs"].includes(storage.provider);

      // Generate provider module
      this.write(
        `server/storage/${toCamelCase(storage.name)}.${ext}`,
        this.render("shared/server/storage/_provider.hbs", {
          storageName: storage.name,
          storageConst: toCamelCase(storage.name),
          provider: storage.provider,
          isLocal: storage.provider === "local",
          isS3: storage.provider === "s3",
          isR2: storage.provider === "r2",
          isGcs: storage.provider === "gcs",
          isCloud,
          bucket: storage.bucket ?? "",
          maxSize: storage.maxSize ?? "10mb",
          allowedTypes: storage.allowedTypes ?? [],
          hasAllowedTypes: (storage.allowedTypes?.length ?? 0) > 0,
          publicPath: storage.publicPath ?? "/uploads",
          envPrefix: storage.name.toUpperCase(),
        }),
      );

      // Generate upload route
      this.write(
        `server/routes/storage/${toCamelCase(storage.name)}.${ext}`,
        this.render("shared/server/routes/storage/_upload.hbs", {
          storageName: storage.name,
          storageConst: toCamelCase(storage.name),
          storageSlug: storage.name.toLowerCase(),
          provider: storage.provider,
          isLocal: storage.provider === "local",
          isCloud,
          maxSize: storage.maxSize ?? "10mb",
          allowedTypes: storage.allowedTypes ?? [],
          hasAllowedTypes: (storage.allowedTypes?.length ?? 0) > 0,
          publicPath: storage.publicPath ?? "/uploads",
        }),
      );
    }
  }
}
