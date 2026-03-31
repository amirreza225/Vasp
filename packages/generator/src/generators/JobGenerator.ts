import { existsSync } from "node:fs";
import { join } from "node:path";
import type { JobNode } from "@vasp-framework/core";
import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase } from "../template/TemplateEngine.js";

export class JobGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    if (ast.jobs.length === 0) return;

    this.ctx.logger.info("Generating background jobs...");

    const hasPgBoss = ast.jobs.some((j) => j.executor === "PgBoss");
    const hasBullMQ = ast.jobs.some((j) => j.executor === "BullMQ");
    const hasRedisStreams = ast.jobs.some((j) => j.executor === "RedisStreams");
    const hasRabbitMQ = ast.jobs.some((j) => j.executor === "RabbitMQ");
    const hasKafka = ast.jobs.some((j) => j.executor === "Kafka");

    // Executor setup/client singletons
    if (hasPgBoss) {
      this.write(
        `server/jobs/boss.${ext}`,
        this.render("shared/jobs/boss.hbs"),
      );
    }
    if (hasBullMQ) {
      this.write(
        `server/jobs/bullmq.${ext}`,
        this.render("shared/jobs/bullmq.hbs"),
      );
    }
    if (hasRedisStreams) {
      this.write(
        `server/jobs/redis-streams.${ext}`,
        this.render("shared/jobs/redis-streams.hbs"),
      );
    }
    if (hasRabbitMQ) {
      this.write(
        `server/jobs/rabbitmq.${ext}`,
        this.render("shared/jobs/rabbitmq.hbs"),
      );
    }
    if (hasKafka) {
      this.write(
        `server/jobs/kafka.${ext}`,
        this.render("shared/jobs/kafka.hbs"),
      );
    }

    // One worker file per job
    for (const job of ast.jobs) {
      this.writeJobWorker(job);

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

  private writeJobWorker(job: JobNode): void {
    const { ext } = this.ctx;
    const fn = job.perform.fn;
    const namedExport = fn.kind === "named" ? fn.namedExport : fn.defaultExport;
    const fnSource = this.resolveServerImport(fn.source, `server/jobs/`);

    const dlqQueue = job.deadLetter?.queue ?? `${toCamelCase(job.name)}-failed`;
    const retryLimit = job.retries?.limit ?? 3;
    const retryDelay = job.retries?.delay ?? 1000;
    const retryMultiplier = job.retries?.multiplier ?? 2;
    const isExponential = (job.retries?.backoff ?? "fixed") === "exponential";
    const priority = job.priority ?? 1;

    const templateData = {
      name: job.name,
      namedExport,
      fnSource,
      schedule: job.schedule,
      hasSchedule: !!job.schedule,
      priority,
      retryLimit,
      retryDelay,
      retryMultiplier,
      isExponential,
      hasDeadLetter: !!job.deadLetter,
      dlqQueue,
    };

    let templateName: string;
    switch (job.executor) {
      case "BullMQ":
        templateName = "shared/jobs/_bullmq-job.hbs";
        break;
      case "RedisStreams":
        templateName = "shared/jobs/_redis-streams-job.hbs";
        break;
      case "RabbitMQ":
        templateName = "shared/jobs/_rabbitmq-job.hbs";
        break;
      case "Kafka":
        templateName = "shared/jobs/_kafka-job.hbs";
        break;
      default:
        templateName = "shared/jobs/_job.hbs";
    }

    this.write(
      `server/jobs/${toCamelCase(job.name)}.${ext}`,
      this.render(templateName, templateData),
    );
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

    const paramType = this.ctx.isTypeScript ? "(_data: unknown)" : "(data)";

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
              `export async function ${name}${paramType} {\n  // TODO: implement\n}`,
          )
          .join("\n\n") + "\n";
      this.write(relativePath, content);
    }
  }
}
