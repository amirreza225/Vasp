import { existsSync } from "node:fs";
import { join } from "node:path";
import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase } from "../template/TemplateEngine.js";

export class EmailGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    if (ast.emails.length === 0) return;

    this.ctx.logger.info("Generating email mailers...");

    for (const email of ast.emails) {
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

    // Generate src/ stub files for email template functions so the server
    // imports resolve on first run (skips files that already exist).
    this.generateEmailTemplateStubs();
  }

  /** Writes stub source files for all email template functions referenced via @src/. */
  private generateEmailTemplateStubs(): void {
    const { ast, ext } = this.ctx;
    const bySource = new Map<string, string[]>();

    for (const email of ast.emails) {
      for (const tpl of email.templates) {
        const { fn } = tpl;
        if (!fn.source.startsWith("@src/")) continue;
        const fnName = fn.kind === "named" ? fn.namedExport : fn.defaultExport;
        if (!bySource.has(fn.source)) bySource.set(fn.source, []);
        bySource.get(fn.source)!.push(fnName);
      }
    }

    const returnType = this.ctx.isTypeScript
      ? ": Promise<{ to: string; subject: string; html: string }>"
      : "";
    const param = this.ctx.isTypeScript ? "(_data: unknown)" : "(_data)";

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
              `export async function ${name}${param}${returnType} {\n  // TODO: implement\n  return { to: '', subject: '', html: '' }\n}`,
          )
          .join("\n\n") + "\n";
      this.write(relativePath, content);
    }
  }
}
