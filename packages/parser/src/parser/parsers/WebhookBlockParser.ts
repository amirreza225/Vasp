import type {
  WebhookMode,
  WebhookNode,
  WebhookVerification,
} from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseWebhook(ctx: IParserContext): WebhookNode {
  const loc = ctx.consume(TokenType.KW_WEBHOOK).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let secret: string | undefined;
  // Inbound
  let path: string | undefined;
  let fn = undefined;
  let verifyWith: WebhookVerification | undefined;
  // Outbound
  let entity: string | undefined;
  let events: string[] | undefined;
  let targets: string | undefined;
  let retry: number | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "secret":
        secret = ctx.parseEnvRef();
        break;
      case "path":
        path = ctx.consumeString();
        break;
      case "fn":
        fn = ctx.parseImportExpression();
        break;
      case "verifyWith":
        verifyWith = ctx.consumeString() as WebhookVerification;
        break;
      case "entity":
        entity = ctx.consumeIdentifier().value;
        break;
      case "events":
        events = ctx.parseIdentifierArray();
        break;
      case "targets":
        targets = ctx.parseEnvRef();
        break;
      case "retry": {
        const tok = ctx.consume(TokenType.NUMBER);
        retry = Number(tok.value);
        break;
      }
      default:
        throw ctx.error(
          "E080_UNKNOWN_WEBHOOK_PROP",
          `Unknown webhook property '${key.value}'`,
          "Valid properties: secret, path, fn, verifyWith, entity, events, targets, retry",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  // Determine mode: inbound has `fn`, outbound has `entity`
  const isInbound = fn !== undefined;
  const isOutbound = entity !== undefined;

  if (!isInbound && !isOutbound) {
    throw ctx.error(
      "E081_MISSING_WEBHOOK_MODE",
      `Webhook block '${name.value}' must define either 'fn' (inbound) or 'entity' (outbound)`,
      'Add: fn: import { handler } from "@src/..." for inbound, or entity: EntityName for outbound',
      loc,
    );
  }

  if (isInbound && isOutbound) {
    throw ctx.error(
      "E082_AMBIGUOUS_WEBHOOK_MODE",
      `Webhook block '${name.value}' cannot define both 'fn' (inbound) and 'entity' (outbound)`,
      "Use either fn or entity, not both",
      loc,
    );
  }

  const mode: WebhookMode = isInbound ? "inbound" : "outbound";

  if (mode === "inbound" && !path) {
    throw ctx.error(
      "E083_INBOUND_WEBHOOK_MISSING_PATH",
      `Inbound webhook '${name.value}' is missing a path`,
      'Add: path: "/webhooks/my-webhook"',
      loc,
    );
  }

  if (mode === "outbound" && (!events || events.length === 0)) {
    throw ctx.error(
      "E084_OUTBOUND_WEBHOOK_MISSING_EVENTS",
      `Outbound webhook '${name.value}' is missing events`,
      "Add: events: [created, updated, deleted]",
      loc,
    );
  }

  if (mode === "outbound" && !targets) {
    throw ctx.error(
      "E085_OUTBOUND_WEBHOOK_MISSING_TARGETS",
      `Outbound webhook '${name.value}' is missing targets`,
      "Add: targets: env(WEBHOOK_URLS)",
      loc,
    );
  }

  return {
    type: "Webhook",
    name: name.value,
    loc,
    mode,
    ...(secret !== undefined ? { secret } : {}),
    ...(path !== undefined ? { path } : {}),
    ...(fn !== undefined ? { fn } : {}),
    ...(verifyWith !== undefined ? { verifyWith } : {}),
    ...(entity !== undefined ? { entity } : {}),
    ...(events !== undefined ? { events } : {}),
    ...(targets !== undefined ? { targets } : {}),
    ...(retry !== undefined ? { retry } : {}),
  };
}
