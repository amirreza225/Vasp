import type {
  ImportExpression,
  ParseDiagnostic,
  SourceLocation,
  VaspAST,
} from "@vasp-framework/core";
import { ParseError } from "@vasp-framework/core";
import { Lexer } from "../lexer/Lexer.js";
import type { Token } from "../lexer/Token.js";
import { BLOCK_KEYWORDS, TokenType } from "../lexer/TokenType.js";
import type { IParserContext } from "./ParserContext.js";
import { parseApp } from "./parsers/AppBlockParser.js";
import { parseAuth } from "./parsers/AuthBlockParser.js";
import { parseEntity } from "./parsers/EntityBlockParser.js";
import { parseRoute } from "./parsers/RouteBlockParser.js";
import { parsePage } from "./parsers/PageBlockParser.js";
import { parseQuery } from "./parsers/QueryBlockParser.js";
import { parseAction } from "./parsers/ActionBlockParser.js";
import { parseCrud } from "./parsers/CrudBlockParser.js";
import { parseApi } from "./parsers/ApiBlockParser.js";
import { parseMiddleware } from "./parsers/MiddlewareBlockParser.js";
import { parseRealtime } from "./parsers/RealtimeBlockParser.js";
import { parseJob } from "./parsers/JobBlockParser.js";
import { parseSeed } from "./parsers/SeedBlockParser.js";
import { parseAdmin } from "./parsers/AdminBlockParser.js";
import { parseStorage } from "./parsers/StorageBlockParser.js";
import { parseEmail } from "./parsers/EmailBlockParser.js";
import { parseCache } from "./parsers/CacheBlockParser.js";
import { parseWebhook } from "./parsers/WebhookBlockParser.js";
import { parseObservability } from "./parsers/ObservabilityBlockParser.js";
import { parseAutoPage } from "./parsers/AutoPageBlockParser.js";

export function parse(source: string, filename = "main.vasp"): VaspAST {
  const tokens = new Lexer(source, filename).tokenize();
  return new Parser(tokens, filename).parse();
}

/**
 * Thin dispatch shell.  Owns only:
 *   - the token stream + cursor
 *   - the top-level parse() loop
 *   - skipToNextBlock() error-recovery
 *   - shared token-consumer primitives (implements IParserContext)
 *
 * All block-specific logic lives in parsers/<Name>BlockParser.ts.
 */
class Parser implements IParserContext {
  private pos = 0;
  private readonly diagnostics: ParseDiagnostic[] = [];

  constructor(
    private readonly tokens: Token[],
    private readonly filename: string,
  ) {}

  // ---- Top-level parse loop ----

  parse(): VaspAST {
    const ast: VaspAST = {
      entities: [],
      routes: [],
      pages: [],
      queries: [],
      actions: [],
      apis: [],
      middlewares: [],
      cruds: [],
      realtimes: [],
      jobs: [],
      storages: [],
      emails: [],
      caches: [],
      webhooks: [],
      autoPages: [],
    };

    while (!this.isEOF()) {
      const kw = this.peek();

      try {
        switch (kw.type) {
          case TokenType.KW_APP:
            if (ast.app) {
              this.consume(TokenType.KW_APP);
              throw this.error(
                "E043_DUPLICATE_APP_BLOCK",
                "Duplicate app block found",
                "Only one app block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.app = parseApp(this);
            break;
          case TokenType.KW_AUTH:
            if (ast.auth) {
              this.consume(TokenType.KW_AUTH);
              throw this.error(
                "E044_DUPLICATE_AUTH_BLOCK",
                "Duplicate auth block found",
                "Only one auth block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.auth = parseAuth(this);
            break;
          case TokenType.KW_ENTITY:
            ast.entities.push(parseEntity(this));
            break;
          case TokenType.KW_ROUTE:
            ast.routes.push(parseRoute(this));
            break;
          case TokenType.KW_PAGE:
            ast.pages.push(parsePage(this));
            break;
          case TokenType.KW_QUERY:
            ast.queries.push(parseQuery(this));
            break;
          case TokenType.KW_ACTION:
            ast.actions.push(parseAction(this));
            break;
          case TokenType.KW_MIDDLEWARE:
            ast.middlewares.push(parseMiddleware(this));
            break;
          case TokenType.KW_API:
            ast.apis.push(parseApi(this));
            break;
          case TokenType.KW_CRUD:
            ast.cruds.push(parseCrud(this));
            break;
          case TokenType.KW_REALTIME:
            ast.realtimes.push(parseRealtime(this));
            break;
          case TokenType.KW_JOB:
            ast.jobs.push(parseJob(this));
            break;
          case TokenType.KW_SEED:
            if (ast.seed) {
              this.consume(TokenType.KW_SEED);
              throw this.error(
                "E040_DUPLICATE_SEED_BLOCK",
                "Duplicate seed block found",
                "Only one seed block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.seed = parseSeed(this);
            break;
          case TokenType.KW_ADMIN:
            if (ast.admin) {
              this.consume(TokenType.KW_ADMIN);
              throw this.error(
                "E046_DUPLICATE_ADMIN_BLOCK",
                "Duplicate admin block found",
                "Only one admin block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.admin = parseAdmin(this);
            break;
          case TokenType.KW_STORAGE:
            ast.storages.push(parseStorage(this));
            break;
          case TokenType.KW_EMAIL:
            ast.emails.push(parseEmail(this));
            break;
          case TokenType.KW_CACHE:
            ast.caches.push(parseCache(this));
            break;
          case TokenType.KW_WEBHOOK:
            ast.webhooks.push(parseWebhook(this));
            break;
          case TokenType.KW_OBSERVABILITY:
            if (ast.observability) {
              this.consume(TokenType.KW_OBSERVABILITY);
              throw this.error(
                "E090_DUPLICATE_OBSERVABILITY_BLOCK",
                "Duplicate observability block found",
                "Only one observability block is allowed in main.vasp",
                kw.loc,
              );
            }
            ast.observability = parseObservability(this);
            break;
          case TokenType.KW_AUTOPAGE:
            ast.autoPages.push(parseAutoPage(this));
            break;
          default:
            throw this.error(
              "E010_UNEXPECTED_TOKEN",
              `Unexpected token '${kw.value}' at top level`,
              "Expected a declaration keyword: app, auth, entity, route, page, query, action, api, middleware, crud, realtime, job, seed, admin, storage, email, cache, webhook, observability, or autoPage",
              kw.loc,
            );
        }
      } catch (err) {
        if (err instanceof ParseError) {
          this.diagnostics.push(...err.diagnostics);
          this.skipToNextBlock();
        } else {
          throw err;
        }
      }
    }

    if (this.diagnostics.length > 0) {
      throw new ParseError(this.diagnostics);
    }

    return ast;
  }

  /** Skip tokens until we reach the closing `}` of the current block, then resume at the next top-level keyword. */
  private skipToNextBlock(): void {
    let depth = 0;
    while (!this.isEOF()) {
      const tok = this.peek();
      if (tok.type === TokenType.LBRACE) {
        depth++;
        this.pos++;
      } else if (tok.type === TokenType.RBRACE) {
        if (depth <= 1) {
          this.pos++; // consume the closing brace
          return;
        }
        depth--;
        this.pos++;
      } else if (depth === 0 && BLOCK_KEYWORDS.has(tok.type)) {
        // We've hit the next block keyword at top level — stop skipping
        return;
      } else {
        this.pos++;
      }
    }
  }

  // ---- IParserContext implementation ----

  peek(): Token {
    return (
      this.tokens[this.pos] ?? {
        type: TokenType.EOF,
        value: "",
        loc: { line: 0, col: 0, offset: 0 },
      }
    );
  }

  check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  isEOF(): boolean {
    return this.check(TokenType.EOF);
  }

  lookahead(n: number): Token | undefined {
    return this.tokens[this.pos + n];
  }

  consume(type: TokenType): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw this.error(
        "E030_EXPECTED_TOKEN",
        `Expected '${type}' but got '${tok.value || tok.type}'`,
        `Add the missing '${type}'`,
        tok.loc,
      );
    }
    this.pos++;
    return tok;
  }

  consumeIdentifier(): Token {
    const tok = this.peek();
    // Accept IDENTIFIER tokens and also block keywords (like 'entity')
    // when they appear in property-name or value position
    if (tok.type !== TokenType.IDENTIFIER && !BLOCK_KEYWORDS.has(tok.type)) {
      throw this.error(
        "E031_EXPECTED_IDENTIFIER",
        `Expected an identifier but got '${tok.value || tok.type}'`,
        "Provide a valid name (letters, digits, underscores)",
        tok.loc,
      );
    }
    this.pos++;
    return tok;
  }

  consumeString(): string {
    const tok = this.peek();
    if (tok.type !== TokenType.STRING) {
      throw this.error(
        "E032_EXPECTED_STRING",
        `Expected a string but got '${tok.value || tok.type}'`,
        'Wrap the value in double quotes: "value"',
        tok.loc,
      );
    }
    this.pos++;
    return tok.value;
  }

  error(
    code: string,
    message: string,
    hint: string,
    loc?: SourceLocation,
  ): ParseError {
    return new ParseError([
      { code, message, hint, ...(loc !== undefined ? { loc } : {}) },
    ]);
  }

  // ---- Shared value parsers ----

  /** Parses: [ Foo, Bar, Baz ] — throws on duplicate elements (E045) */
  parseIdentifierArray(): string[] {
    this.consume(TokenType.LBRACKET);
    const items: string[] = [];
    const seen = new Set<string>();

    while (!this.check(TokenType.RBRACKET)) {
      const tok = this.consumeIdentifier();
      if (seen.has(tok.value)) {
        throw this.error(
          "E045_DUPLICATE_ARRAY_ELEMENT",
          `Duplicate element '${tok.value}' in list`,
          "Each element in a list must be unique",
          tok.loc,
        );
      }
      seen.add(tok.value);
      items.push(tok.value);
      if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
    }
    this.consume(TokenType.RBRACKET);
    return items;
  }

  /** Parses: ["foo", "bar", "baz"] */
  parseStringArray(): string[] {
    this.consume(TokenType.LBRACKET);
    const items: string[] = [];
    while (!this.check(TokenType.RBRACKET)) {
      items.push(this.consumeString());
      if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA);
    }
    this.consume(TokenType.RBRACKET);
    return items;
  }

  /**
   * Parses both import forms:
   *   import Foo from "@src/..."        → DefaultImportExpression
   *   import { foo } from "@src/..."    → NamedImportExpression
   */
  parseImportExpression(): ImportExpression {
    this.consume(TokenType.KW_IMPORT);

    // Named import: import { foo } from "..."
    if (this.check(TokenType.LBRACE)) {
      this.consume(TokenType.LBRACE);
      const namedExport = this.consumeIdentifier().value;
      this.consume(TokenType.RBRACE);
      this.consume(TokenType.KW_FROM);
      const source = this.consumeString();
      return { kind: "named", namedExport, source };
    }

    // Default import: import Foo from "..."
    const defaultExport = this.consumeIdentifier().value;
    this.consume(TokenType.KW_FROM);
    const source = this.consumeString();
    return { kind: "default", defaultExport, source };
  }

  /** Parses: env(VAR_NAME) and returns the env var name (e.g. "REDIS_URL") */
  parseEnvRef(): string {
    const tok = this.consumeIdentifier();
    if (tok.value !== "env") {
      throw this.error(
        "E076_EXPECTED_ENV_REF",
        `Expected 'env(VAR_NAME)' but got '${tok.value}'`,
        "Use the env() function to reference env vars: url: env(REDIS_URL)",
        tok.loc,
      );
    }
    this.consume(TokenType.LPAREN);
    const varName = this.consumeIdentifier().value;
    this.consume(TokenType.RPAREN);
    return varName;
  }
}
