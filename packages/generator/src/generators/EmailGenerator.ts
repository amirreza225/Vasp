import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase } from "../template/TemplateEngine.js";

export class EmailGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    if ((ast.emails ?? []).length === 0) return;

    this.ctx.logger.info("Generating email mailers...");

    for (const email of ast.emails!) {
      this.write(
        `server/email/${toCamelCase(email.name)}.${ext}`,
        this.render("shared/email/_mailer.hbs", {
          name: email.name,
          provider: email.provider,
          from: email.from,
          templates: email.templates.map((tpl) => ({
            name: tpl.name,
            fnSource: this.resolveServerImport(tpl.fn.source, "server/email/"),
            namedExport:
              tpl.fn.kind === "named"
                ? tpl.fn.namedExport
                : tpl.fn.defaultExport,
            isDefault: tpl.fn.kind === "default",
          })),
        }),
      );
    }
  }
}
