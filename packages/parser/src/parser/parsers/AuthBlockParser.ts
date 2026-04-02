import type { AuthMethod, AuthNode, PermissionMap } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

/**
 * Parses the permission name that may be a simple identifier ("read") or a
 * namespaced identifier ("task:read"). Uses one token of lookahead so that
 * the `COLON` inside `task:read` is not confused with a key-value separator.
 *
 * Lookahead pattern detected as namespace: COLON followed immediately by
 * another IDENTIFIER token (the name segment).
 */
export function parsePermissionName(ctx: IParserContext): string {
  const first = ctx.consumeIdentifier().value;
  // Peek ahead: if the next token is COLON and the token after is an
  // IDENTIFIER, this is a namespaced permission name (e.g. "task:read").
  if (
    ctx.check(TokenType.COLON) &&
    ctx.lookahead(1)?.type === TokenType.IDENTIFIER
  ) {
    ctx.consume(TokenType.COLON);
    const second = ctx.consumeIdentifier().value;
    return `${first}:${second}`;
  }
  return first;
}

/**
 * Parses the auth `permissions` block:
 *   { task:create: [admin, manager] task:read: [admin, viewer] }
 *
 * Keys may be namespaced (task:create) or simple (read).
 * Values are arrays of role identifiers.
 */
export function parseAuthPermissionsMap(ctx: IParserContext): PermissionMap {
  ctx.consume(TokenType.LBRACE);
  const result: PermissionMap = {};

  while (!ctx.check(TokenType.RBRACE)) {
    // Parse key — may be "ns:name" or a simple name.
    // After consuming the first identifier, check whether the next COLON is
    // a namespace separator or the key-value separator:
    //   ns:name:  → IDENTIFIER COLON IDENTIFIER COLON [...]
    //   simple:   → IDENTIFIER COLON [...]
    const first = ctx.consumeIdentifier().value;
    let key = first;
    if (
      ctx.check(TokenType.COLON) &&
      ctx.lookahead(1)?.type === TokenType.IDENTIFIER &&
      ctx.lookahead(2)?.type === TokenType.COLON
    ) {
      // Namespace separator — consume the COLON and the name segment.
      ctx.consume(TokenType.COLON);
      const second = ctx.consumeIdentifier().value;
      key = `${first}:${second}`;
    }
    // Consume the key-value separator.
    ctx.consume(TokenType.COLON);
    const roles = ctx.parseIdentifierArray();
    result[key] = roles;
  }

  ctx.consume(TokenType.RBRACE);
  return result;
}

export function parseAuth(ctx: IParserContext): AuthNode {
  const loc = ctx.consume(TokenType.KW_AUTH).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let userEntity = "";
  let methods: AuthMethod[] = [];
  let roles: string[] = [];
  let permissions: PermissionMap | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "userEntity":
        userEntity = ctx.consumeIdentifier().value;
        break;
      case "methods":
        methods = ctx.parseIdentifierArray() as AuthMethod[];
        break;
      case "roles":
        roles = ctx.parseIdentifierArray();
        break;
      case "permissions":
        permissions = parseAuthPermissionsMap(ctx);
        break;
      default:
        throw ctx.error(
          "E013_UNKNOWN_PROP",
          `Unknown auth property '${key.value}'`,
          "Valid properties: userEntity, methods, roles, permissions",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return {
    type: "Auth",
    name: name.value,
    loc,
    userEntity,
    methods,
    ...(roles.length > 0 ? { roles } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
  };
}
