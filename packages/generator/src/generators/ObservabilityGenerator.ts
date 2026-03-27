import { BaseGenerator } from "./BaseGenerator.js";

export class ObservabilityGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    const obs = ast.observability;
    if (!obs) return;

    this.ctx.logger.info("Generating OpenTelemetry instrumentation...");

    // Core telemetry setup — must be imported first in server/index.{ext}
    this.write(
      `server/telemetry/index.${ext}`,
      this.render("shared/server/telemetry/index.hbs", {
        tracing: obs.tracing,
        metrics: obs.metrics,
        exporter: obs.exporter,
        errorTracking: obs.errorTracking,
        hasOtlpExporter: obs.exporter === "otlp",
        hasPrometheusExporter: obs.exporter === "prometheus",
        hasSentry: obs.errorTracking === "sentry",
        hasDatadog: obs.errorTracking === "datadog",
      }),
    );

    // Prometheus metrics helpers — only when metrics are enabled
    if (obs.metrics) {
      this.write(
        `server/telemetry/metrics.${ext}`,
        this.render("shared/server/telemetry/metrics.hbs", {
          exporter: obs.exporter,
          hasPrometheusExporter: obs.exporter === "prometheus",
        }),
      );
    }
  }
}
