import type {
  EmailNode,
  EmailProvider,
  EmailTemplateEntry,
} from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseEmail(ctx: IParserContext): EmailNode {
  const loc = ctx.consume(TokenType.KW_EMAIL).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let provider: EmailProvider | null = null;
  let from = "";
  const templates: EmailTemplateEntry[] = [];

  while (!ctx.check(TokenType.RBRACE)) {
    // `from` is a reserved keyword (KW_FROM) in the lexer, so we must handle
    // it specially as a property key inside the email block.
    let key;
    if (ctx.peek().type === TokenType.KW_FROM) {
      key = ctx.consume(TokenType.KW_FROM);
    } else {
      key = ctx.consumeIdentifier();
    }
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "provider":
        provider = ctx.consumeIdentifier().value as EmailProvider;
        break;
      case "from":
        from = ctx.consumeString();
        break;
      case "templates": {
        ctx.consume(TokenType.LBRACE);
        while (!ctx.check(TokenType.RBRACE)) {
          const templateName = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          const fn = ctx.parseImportExpression();
          templates.push({ name: templateName.value, fn });
          if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
        }
        ctx.consume(TokenType.RBRACE);
        break;
      }
      default:
        throw ctx.error(
          "E058_UNKNOWN_PROP",
          `Unknown email property '${key.value}'`,
          "Valid properties: provider, from, templates",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!provider) {
    throw ctx.error(
      "E059_MISSING_EMAIL_PROVIDER",
      `Email block '${name.value}' is missing a provider`,
      "Add: provider: resend (or sendgrid, smtp)",
      loc,
    );
  }

  if (!from) {
    throw ctx.error(
      "E060_MISSING_EMAIL_FROM",
      `Email block '${name.value}' is missing from address`,
      'Add: from: "noreply@myapp.com"',
      loc,
    );
  }

  return {
    type: "Email",
    name: name.value,
    loc,
    provider,
    from,
    templates,
  };
}
