import type { ActionNode, ActionOnSuccess } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseAction(ctx: IParserContext): ActionNode {
  const loc = ctx.consume(TokenType.KW_ACTION).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let fn = null;
  let entities: string[] = [];
  let auth = false;
  let roles: string[] = [];
  let onSuccess: ActionOnSuccess | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "fn":
        fn = ctx.parseImportExpression();
        break;
      case "entities":
        entities = ctx.parseIdentifierArray();
        break;
      case "auth":
        auth = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      case "roles":
        roles = ctx.parseIdentifierArray();
        break;
      case "onSuccess": {
        ctx.consume(TokenType.LBRACE);
        const successConfig: ActionOnSuccess = {};
        while (!ctx.check(TokenType.RBRACE)) {
          const innerKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          if (innerKey.value === "sendEmail") {
            successConfig.sendEmail = ctx.consumeIdentifier().value;
          } else {
            throw ctx.error(
              "E057_UNKNOWN_PROP",
              `Unknown onSuccess property '${innerKey.value}'`,
              "Valid properties: sendEmail",
              innerKey.loc,
            );
          }
        }
        ctx.consume(TokenType.RBRACE);
        onSuccess = successConfig;
        break;
      }
      default:
        throw ctx.error(
          "E019_UNKNOWN_PROP",
          `Unknown action property '${key.value}'`,
          "Valid properties: fn, entities, auth, roles, onSuccess",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!fn) {
    throw ctx.error(
      "E020_MISSING_FN",
      `Action '${name.value}' is missing fn`,
      'Add: fn: import { myFn } from "@src/actions.js"',
      loc,
    );
  }

  return {
    type: "Action",
    name: name.value,
    loc,
    fn,
    entities,
    auth,
    ...(roles.length > 0 ? { roles } : {}),
    ...(onSuccess !== undefined ? { onSuccess } : {}),
  };
}
