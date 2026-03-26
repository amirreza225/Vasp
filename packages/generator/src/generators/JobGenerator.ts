import { existsSync } from "node:fs";
import { join } from "node:path";
import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase } from "../template/TemplateEngine.js";

export class JobGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    if (ast.jobs.length === 0) return;

    this.ctx.logger.info("Generating background jobs...");

    // PgBoss singleton
    this.write(`server/jobs/boss.${ext}`, this.render("shared/jobs/boss.hbs"));

    // One worker file per job
    for (const job of ast.jobs) {
      const fn = job.perform.fn;
      const namedExport =
        fn.kind === "named" ? fn.namedExport : fn.defaultExport;

      this.write(
        `server/jobs/${toCamelCase(job.name)}.${ext}`,
        this.render("shared/jobs/_job.hbs", {
          name: job.name,
          namedExport,
          fnSource: this.resolveServerImport(fn.source, `server/jobs/`),
          schedule: job.schedule,
          hasSchedule: !!job.schedule,
        }),
      );

      // HTTP endpoint to schedule this job
      this.write(
        `server/routes/jobs/${toCamelCase(job.name)}Schedule.${ext}`,
        this.render("shared/server/routes/jobs/_schedule.hbs", {
          name: job.name,
        }),
      );
    }

    // Generate src/ stub files so the server imports resolve on first run
    this.generateJobStubs();
  }

  /** Groups job perform functions by source file and writes a stub for each. Skips existing files. */
  private generateJobStubs(): void {
    const bySource = new Map<string, string[]>();
    for (const job of this.ctx.ast.jobs) {
      const { fn } = job.perform;
      if (!fn.source.startsWith("@src/")) continue;
      const fnName = fn.kind === "named" ? fn.namedExport : fn.defaultExport;
      if (!bySource.has(fn.source)) bySource.set(fn.source, []);
      bySource.get(fn.source)!.push(fnName);
    }

    const paramType = this.ctx.isTypeScript ? "(data: any)" : "(data)";

    for (const [source, fnNames] of bySource) {
      const relativePath = source.replace("@src/", "src/");
      if (existsSync(join(this.ctx.projectDir, relativePath))) continue;
      const content =
        fnNames
          .map(
            (name) =>
              `export async function ${name}${paramType} {\n  // TODO: implement\n}`,
          )
          .join("\n\n") + "\n";
      this.write(relativePath, content);
    }
  }
}
