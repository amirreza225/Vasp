import { parse } from "@vasp-framework/parser";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR } from "./test-helpers.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "observability");

let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

const BASE_APP = `
app ObsApp {
  title: "Obs App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`;

describe("ObservabilityGenerator", () => {
  it("does not generate telemetry files when no observability block is present", () => {
    const ast = parse(BASE_APP);
    const outputDir = join(TMP_DIR, "no-obs");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/telemetry/index.js"))).toBe(
      false,
    );
    expect(existsSync(join(outputDir, "server/telemetry/metrics.js"))).toBe(
      false,
    );
  });

  it("generates telemetry/index.js with OTLP tracing and Sentry when configured", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        tracing: true
        metrics: true
        exporter: otlp
        errorTracking: sentry
      }
    `);
    const outputDir = join(TMP_DIR, "obs-otlp-sentry");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/telemetry/index.js"))).toBe(true);
    const content = readFileSync(
      join(outputDir, "server/telemetry/index.js"),
      "utf8",
    );
    expect(content).toContain("@opentelemetry/sdk-node");
    expect(content).toContain("@opentelemetry/exporter-trace-otlp-http");
    expect(content).toContain("@sentry/bun");
    expect(content).toContain("Sentry.init(");
    expect(content).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
    expect(content).toContain("_sdk.start()");
    expect(content).toContain("export const telemetryReady = true");
  });

  it("generates telemetry/metrics.js when metrics is enabled", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        metrics: true
        exporter: prometheus
      }
    `);
    const outputDir = join(TMP_DIR, "obs-metrics");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/telemetry/metrics.js"))).toBe(
      true,
    );
    const metrics = readFileSync(
      join(outputDir, "server/telemetry/metrics.js"),
      "utf8",
    );
    expect(metrics).toContain("httpRequestCounter");
    expect(metrics).toContain("httpRequestDuration");
    expect(metrics).toContain("errorCounter");
    expect(metrics).toContain("getPrometheusMetrics");
  });

  it("does not generate telemetry/metrics.js when metrics is false", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        tracing: true
      }
    `);
    const outputDir = join(TMP_DIR, "obs-no-metrics");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/telemetry/index.js"))).toBe(true);
    expect(existsSync(join(outputDir, "server/telemetry/metrics.js"))).toBe(
      false,
    );
  });

  it("includes OTel import in server/index.js when observability is enabled", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        tracing: true
      }
    `);
    const outputDir = join(TMP_DIR, "obs-server-import");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("import './telemetry/index.js'");
    // OTel import must appear before Elysia import
    const otelIdx = serverIndex.indexOf("import './telemetry/index.js'");
    const elysiaIdx = serverIndex.indexOf("from 'elysia'");
    expect(otelIdx).toBeLessThan(elysiaIdx);
  });

  it("includes /api/metrics endpoint when metrics is enabled", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        metrics: true
        exporter: prometheus
      }
    `);
    const outputDir = join(TMP_DIR, "obs-metrics-endpoint");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const serverIndex = readFileSync(
      join(outputDir, "server/index.js"),
      "utf8",
    );
    expect(serverIndex).toContain("'/api/metrics'");
    expect(serverIndex).toContain("getPrometheusMetrics");
    expect(serverIndex).toContain(
      "text/plain; version=0.0.4; charset=utf-8",
    );
  });

  it("includes OTel packages in package.json when observability is enabled", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        tracing: true
        metrics: true
        exporter: otlp
        errorTracking: sentry
      }
    `);
    const outputDir = join(TMP_DIR, "obs-package-json");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const pkg = JSON.parse(
      readFileSync(join(outputDir, "package.json"), "utf8"),
    );
    expect(pkg.dependencies["@opentelemetry/api"]).toBeDefined();
    expect(pkg.dependencies["@opentelemetry/sdk-node"]).toBeDefined();
    expect(pkg.dependencies["@opentelemetry/exporter-trace-otlp-http"]).toBeDefined();
    expect(pkg.dependencies["@opentelemetry/sdk-metrics"]).toBeDefined();
    expect(pkg.dependencies["@sentry/bun"]).toBeDefined();
  });

  it("includes structured logging in logger middleware when logs: structured", () => {
    const ast = parse(`
      ${BASE_APP}
      observability {
        logs: structured
      }
    `);
    const outputDir = join(TMP_DIR, "obs-structured-logs");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const logger = readFileSync(
      join(outputDir, "server/middleware/logger.js"),
      "utf8",
    );
    expect(logger).toContain("JSON.stringify");
    expect(logger).toContain("timestamp:");
    // Console color output should NOT be present in structured mode
    expect(logger).not.toContain("colorMethod");
  });
});
