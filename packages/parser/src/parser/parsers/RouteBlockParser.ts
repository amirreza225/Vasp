import type { RouteNode } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

/** Extract route params from a path string, e.g. "/users/:id" → ["id"] */
function extractRouteParams(path: string): string[] {
  const matches = path.match(/:([^/]+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

export function parseRoute(ctx: IParserContext): RouteNode {
  const loc = ctx.consume(TokenType.KW_ROUTE).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let path = "";
  let to = "";
  let routeProtected: boolean | undefined = undefined;
  let roles: string[] | undefined = undefined;
  let navLabel: string | undefined = undefined;
  let hideFromNav: boolean | undefined = undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "path":
        path = ctx.consumeString();
        break;
      case "to":
        to = ctx.consumeIdentifier().value;
        break;
      case "protected":
        routeProtected = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      case "roles": {
        // roles: [ admin, editor ]
        ctx.consume(TokenType.LBRACKET);
        roles = [];
        while (!ctx.check(TokenType.RBRACKET)) {
          roles.push(ctx.consumeIdentifier().value);
          if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
        }
        ctx.consume(TokenType.RBRACKET);
        break;
      }
      case "navLabel":
        navLabel = ctx.consumeString();
        break;
      case "hideFromNav":
        hideFromNav = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      default:
        throw ctx.error(
          "E014_UNKNOWN_PROP",
          `Unknown route property '${key.value}'`,
          "Valid properties: path, to, protected, roles, navLabel, hideFromNav",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  const params = extractRouteParams(path);
  const node: RouteNode = {
    type: "Route",
    name: name.value,
    loc,
    path,
    to,
    params,
  };
  if (routeProtected !== undefined) node.protected = routeProtected;
  if (roles !== undefined) node.roles = roles;
  if (navLabel !== undefined) node.navLabel = navLabel;
  if (hideFromNav !== undefined) node.hideFromNav = hideFromNav;
  return node;
}
