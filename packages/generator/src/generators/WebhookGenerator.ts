import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase, toPascalCase } from "../template/TemplateEngine.js";

export class WebhookGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    const webhooks = ast.webhooks ?? [];
    if (webhooks.length === 0) return;

    this.ctx.logger.info("Generating webhook handlers...");

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
            retry: webhook.retry ?? 0,
            hasRetry: (webhook.retry ?? 0) > 0,
          }),
        );
      }
    }
  }
}
