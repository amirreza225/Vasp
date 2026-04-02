import type {
  JobBackoffStrategy,
  JobDeadLetterConfig,
  JobNode,
  JobRetryConfig,
} from "@vasp-framework/core";
import { SUPPORTED_JOB_BACKOFF_STRATEGIES } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseJob(ctx: IParserContext): JobNode {
  const loc = ctx.consume(TokenType.KW_JOB).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let executor = "PgBoss" as JobNode["executor"];
  let performFn = null;
  let schedule: string | undefined;
  let priority: number | undefined;
  let retries: JobRetryConfig | undefined;
  let deadLetter: JobDeadLetterConfig | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "executor":
        executor = ctx.consumeIdentifier().value as JobNode["executor"];
        break;
      case "priority": {
        const tok = ctx.consume(TokenType.NUMBER);
        priority = Number(tok.value);
        break;
      }
      case "retries": {
        // Nested block: retries: { limit: N, backoff: exponential, delay: N, multiplier: N }
        ctx.consume(TokenType.LBRACE);
        const retriesCfg: JobRetryConfig = {};
        while (!ctx.check(TokenType.RBRACE)) {
          const innerKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          switch (innerKey.value) {
            case "limit": {
              const tok = ctx.consume(TokenType.NUMBER);
              retriesCfg.limit = Number(tok.value);
              break;
            }
            case "backoff": {
              const backoffTok = ctx.consumeIdentifier();
              if (
                !(SUPPORTED_JOB_BACKOFF_STRATEGIES as readonly string[]).includes(
                  backoffTok.value,
                )
              ) {
                throw ctx.error(
                  "E026_UNKNOWN_BACKOFF",
                  `Unknown backoff strategy '${backoffTok.value}'`,
                  `Valid strategies: ${SUPPORTED_JOB_BACKOFF_STRATEGIES.join(", ")}`,
                  backoffTok.loc,
                );
              }
              retriesCfg.backoff = backoffTok.value as JobBackoffStrategy;
              break;
            }
            case "delay": {
              const tok = ctx.consume(TokenType.NUMBER);
              retriesCfg.delay = Number(tok.value);
              break;
            }
            case "multiplier": {
              const tok = ctx.consume(TokenType.NUMBER);
              retriesCfg.multiplier = Number(tok.value);
              break;
            }
            default:
              throw ctx.error(
                "E027_UNKNOWN_PROP",
                `Unknown retries property '${innerKey.value}'`,
                "Valid properties: limit, backoff, delay, multiplier",
                innerKey.loc,
              );
          }
        }
        ctx.consume(TokenType.RBRACE);
        retries = retriesCfg;
        break;
      }
      case "deadLetter": {
        // Nested block: deadLetter: { queue: "name" }
        ctx.consume(TokenType.LBRACE);
        const dlqCfg: JobDeadLetterConfig = {};
        while (!ctx.check(TokenType.RBRACE)) {
          const innerKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          if (innerKey.value === "queue") {
            dlqCfg.queue = ctx.consumeString();
          } else {
            throw ctx.error(
              "E028_UNKNOWN_PROP",
              `Unknown deadLetter property '${innerKey.value}'`,
              "Valid properties: queue",
              innerKey.loc,
            );
          }
        }
        ctx.consume(TokenType.RBRACE);
        deadLetter = dlqCfg;
        break;
      }
      case "perform": {
        // Nested block: perform: { fn: import ... }
        ctx.consume(TokenType.LBRACE);
        while (!ctx.check(TokenType.RBRACE)) {
          const innerKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          if (innerKey.value === "fn") {
            performFn = ctx.parseImportExpression();
          } else {
            throw ctx.error(
              "E023_UNKNOWN_PROP",
              `Unknown perform property '${innerKey.value}'`,
              "Valid properties: fn",
              innerKey.loc,
            );
          }
        }
        ctx.consume(TokenType.RBRACE);
        break;
      }
      case "schedule":
        schedule = ctx.consumeString();
        break;
      default:
        throw ctx.error(
          "E024_UNKNOWN_PROP",
          `Unknown job property '${key.value}'`,
          "Valid properties: executor, priority, retries, deadLetter, perform, schedule",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!performFn) {
    throw ctx.error(
      "E025_MISSING_PERFORM",
      `Job '${name.value}' is missing perform.fn`,
      'Add: perform: { fn: import { myJob } from "@src/jobs.js" }',
      loc,
    );
  }

  return {
    type: "Job",
    name: name.value,
    loc,
    executor,
    perform: { fn: performFn },
    ...(schedule !== undefined ? { schedule } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(retries !== undefined ? { retries } : {}),
    ...(deadLetter !== undefined ? { deadLetter } : {}),
  };
}
