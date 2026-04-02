import type {
  ErrorTrackingProvider,
  ObservabilityExporter,
  ObservabilityLogsMode,
  ObservabilityNode,
} from "@vasp-framework/core";
import {
  SUPPORTED_ERROR_TRACKING_PROVIDERS,
  SUPPORTED_OBSERVABILITY_EXPORTERS,
  SUPPORTED_OBSERVABILITY_LOGS_MODES,
} from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseObservability(ctx: IParserContext): ObservabilityNode {
  const loc = ctx.consume(TokenType.KW_OBSERVABILITY).loc;
  ctx.consume(TokenType.LBRACE);

  let tracing = false;
  let metrics = false;
  let logs: ObservabilityLogsMode = "console";
  let exporter: ObservabilityExporter = "console";
  let errorTracking: ErrorTrackingProvider = "none";

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "tracing": {
        const tok = ctx.consume(TokenType.BOOLEAN);
        tracing = tok.value === "true";
        break;
      }
      case "metrics": {
        const tok = ctx.consume(TokenType.BOOLEAN);
        metrics = tok.value === "true";
        break;
      }
      case "logs": {
        const tok = ctx.consumeIdentifier();
        if (
          !(SUPPORTED_OBSERVABILITY_LOGS_MODES as readonly string[]).includes(
            tok.value,
          )
        ) {
          throw ctx.error(
            "E091_INVALID_OBSERVABILITY_LOGS_MODE",
            `Invalid observability logs mode '${tok.value}'`,
            `Valid values: ${SUPPORTED_OBSERVABILITY_LOGS_MODES.join(", ")}`,
            tok.loc,
          );
        }
        logs = tok.value as ObservabilityLogsMode;
        break;
      }
      case "exporter": {
        const tok = ctx.consumeIdentifier();
        if (
          !(SUPPORTED_OBSERVABILITY_EXPORTERS as readonly string[]).includes(
            tok.value,
          )
        ) {
          throw ctx.error(
            "E092_INVALID_OBSERVABILITY_EXPORTER",
            `Invalid observability exporter '${tok.value}'`,
            `Valid values: ${SUPPORTED_OBSERVABILITY_EXPORTERS.join(", ")}`,
            tok.loc,
          );
        }
        exporter = tok.value as ObservabilityExporter;
        break;
      }
      case "errorTracking": {
        const tok = ctx.consumeIdentifier();
        if (
          !(SUPPORTED_ERROR_TRACKING_PROVIDERS as readonly string[]).includes(
            tok.value,
          )
        ) {
          throw ctx.error(
            "E093_INVALID_ERROR_TRACKING_PROVIDER",
            `Invalid errorTracking value '${tok.value}'`,
            `Valid values: ${SUPPORTED_ERROR_TRACKING_PROVIDERS.join(", ")}`,
            tok.loc,
          );
        }
        errorTracking = tok.value as ErrorTrackingProvider;
        break;
      }
      default:
        throw ctx.error(
          "E094_UNKNOWN_OBSERVABILITY_PROP",
          `Unknown observability property '${key.value}'`,
          "Valid properties: tracing, metrics, logs, exporter, errorTracking",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  return {
    type: "Observability",
    tracing,
    metrics,
    logs,
    exporter,
    errorTracking,
    loc,
  };
}
