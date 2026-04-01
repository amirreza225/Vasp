import { existsSync } from "node:fs";
import { join } from "node:path";
import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase, toPascalCase } from "../template/TemplateEngine.js";

export class WebhookGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    const webhooks = ast.webhooks;
    if (webhooks.length === 0) return;

    this.ctx.logger.info("Generating webhook handlers...");

    // Determine which job executor to use for outbound webhook dispatch.
    // PgBoss is preferred (uses the existing DB, no extra infra); BullMQ is the fallback.
    const hasPgBossJobs = ast.jobs.some((j) => j.executor === "PgBoss");
    const hasBullMQJobs = ast.jobs.some((j) => j.executor === "BullMQ");
    const outboundWebhooks = webhooks.filter((w) => w.mode === "outbound");

    // Emit the shared webhook dispatch worker once when any outbound webhook
    // can route through a job queue.
    const usesPgBoss = hasPgBossJobs;
    const usesBullMQ = !hasPgBossJobs && hasBullMQJobs;
    const hasJobQueue = outboundWebhooks.length > 0 && (usesPgBoss || usesBullMQ);

    if (hasJobQueue) {
      this.write(
        `server/webhooks/webhookDispatch.${ext}`,
        this.render("shared/server/webhooks/_outbound-worker.hbs", {
          usesPgBoss,
          usesBullMQ,
        }),
      );
    }

    for (const webhook of webhooks) {
      if (webhook.mode === "inbound") {
        const fnSource =
          webhook.fn != null
            ? this.resolveServerImport(
                webhook.fn.source,
                "server/routes/webhooks/",
              )
            : "";
        const fnExport =
          webhook.fn != null
            ? webhook.fn.kind === "named"
              ? webhook.fn.namedExport
              : webhook.fn.defaultExport
            : "";
        const fnIsDefault = webhook.fn?.kind === "default";

        this.write(
          `server/routes/webhooks/${toCamelCase(webhook.name)}.${ext}`,
          this.render("shared/server/webhooks/_inbound.hbs", {
            webhookName: webhook.name,
            webhookConst: toCamelCase(webhook.name),
            webhookPascal: toPascalCase(webhook.name),
            path: webhook.path ?? `/webhooks/${toCamelCase(webhook.name)}`,
            hasSecret: !!webhook.secret,
            secretEnvVar: webhook.secret ?? "",
            hasVerifyWith: !!webhook.verifyWith,
            verifyWith: webhook.verifyWith ?? "",
            isStripeSignature: webhook.verifyWith === "stripe-signature",
            isGithubSignature: webhook.verifyWith === "github-signature",
            isHmac: webhook.verifyWith === "hmac",
            fnSource,
            fnExport,
            fnIsDefault,
          }),
        );
      } else {
        // outbound
        const retry = webhook.retry ?? 0;
        this.write(
          `server/webhooks/${toCamelCase(webhook.name)}.${ext}`,
          this.render("shared/server/webhooks/_outbound.hbs", {
            webhookName: webhook.name,
            webhookConst: toCamelCase(webhook.name),
            webhookPascal: toPascalCase(webhook.name),
            entity: webhook.entity ?? "",
            events: webhook.events ?? [],
            targetsEnvVar: webhook.targets ?? "",
            hasSecret: !!webhook.secret,
            secretEnvVar: webhook.secret ?? "",
            retry,
            // BullMQ counts total attempts (initial + retries), so add 1
            retryAttempts: retry + 1,
            usesPgBoss,
            usesBullMQ,
          }),
        );
      }
    }

    // Generate src/ stub files for inbound webhook handler functions so the
    // server import resolves on first run. Skips files that already exist.
    this.generateWebhookStubs();
  }

  /** Groups inbound webhook handler functions by source file and writes stubs. */
  private generateWebhookStubs(): void {
    const bySource = new Map<string, string[]>();
    for (const webhook of this.ctx.ast.webhooks) {
      if (webhook.mode !== "inbound" || !webhook.fn) continue;
      const { fn } = webhook;
      if (!fn.source.startsWith("@src/")) continue;
      const fnName = fn.kind === "named" ? fn.namedExport : fn.defaultExport;
      if (!bySource.has(fn.source)) bySource.set(fn.source, []);
      bySource.get(fn.source)!.push(fnName);
    }

    const paramType = this.ctx.isTypeScript
      ? "(_body: unknown): Promise<void>"
      : "(_body)";

    for (const [source, fnNames] of bySource) {
      let relativePath = source.replace("@src/", "src/");
      if (this.ctx.isTypeScript && relativePath.endsWith(".js")) {
        relativePath = relativePath.slice(0, -3) + ".ts";
      }
      if (existsSync(join(this.ctx.projectDir, relativePath))) continue;
      const content =
        fnNames
          .map(
            (name) =>
              `export async function ${name}${paramType} {\n  // TODO: implement webhook handler\n}`,
          )
          .join("\n\n") + "\n";
      this.write(relativePath, content);
    }
  }
}
