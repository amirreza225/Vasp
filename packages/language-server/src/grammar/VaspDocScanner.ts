/**
 * VaspDocScanner.ts — Fault-tolerant document summary scanner for the Vasp DSL.
 *
 * Replaces the old Chevrotain-based grammar (VaspLexer / VaspParser /
 * VaspCstVisitor) with a single lightweight pass over the token stream
 * produced by the *real* Lexer from @vasp-framework/parser.
 *
 * Benefits over the Chevrotain approach:
 *   - Single source of truth for tokenisation — any new DSL keyword added to
 *     the real Lexer is automatically recognised here, with no extra files to
 *     update.
 *   - Fault-tolerant by design: brace-counting recovery means broken documents
 *     still produce useful block summaries for completions, hover, and
 *     go-to-definition.
 *   - Zero additional runtime dependency (chevrotain removed).
 *
 * The produced DocumentAST / BlockSummary types are identical to what
 * document-store.ts, completions.ts, and definition.ts already consume.
 */

import { Lexer, TokenType } from "@vasp-framework/parser";
import type { Token } from "@vasp-framework/parser";

// ── Public types (previously defined in VaspCstVisitor.ts) ────────────────────

/** Lightweight block summary consumed by LSP features */
export interface BlockSummary {
  kind:
    | "app"
    | "auth"
    | "entity"
    | "route"
    | "page"
    | "query"
    | "action"
    | "api"
    | "middleware"
    | "crud"
    | "realtime"
    | "job"
    | "seed"
    | "admin"
    | "storage"
    | "email"
    | "cache"
    | "webhook"
    | "observability"
    | "autoPage";
  name: string;
  /** For entity blocks: field name → type string */
  fields?: Record<string, string>;
  /** For route blocks: the "to" page name */
  toPage?: string;
  /** For crud blocks: the referenced entity name */
  entityRef?: string;
  /** Character offset of the name token in the source */
  nameOffset?: number;
  /** Length of the name token */
  nameLength?: number;
}

export interface DocumentAST {
  blocks: BlockSummary[];
}

// ── Token-type → block kind map ───────────────────────────────────────────────

const KEYWORD_TO_KIND = new Map<TokenType, BlockSummary["kind"]>([
  [TokenType.KW_APP, "app"],
  [TokenType.KW_AUTH, "auth"],
  [TokenType.KW_ENTITY, "entity"],
  [TokenType.KW_ROUTE, "route"],
  [TokenType.KW_PAGE, "page"],
  [TokenType.KW_QUERY, "query"],
  [TokenType.KW_ACTION, "action"],
  [TokenType.KW_API, "api"],
  [TokenType.KW_MIDDLEWARE, "middleware"],
  [TokenType.KW_CRUD, "crud"],
  [TokenType.KW_REALTIME, "realtime"],
  [TokenType.KW_JOB, "job"],
  [TokenType.KW_SEED, "seed"],
  [TokenType.KW_ADMIN, "admin"],
  [TokenType.KW_STORAGE, "storage"],
  [TokenType.KW_EMAIL, "email"],
  [TokenType.KW_CACHE, "cache"],
  [TokenType.KW_WEBHOOK, "webhook"],
  [TokenType.KW_OBSERVABILITY, "observability"],
  [TokenType.KW_AUTOPAGE, "autoPage"],
]);

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Lightweight scanner that converts a .vasp source string into a
 * DocumentAST suitable for LSP features. Never throws.
 */
class Scanner {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(source: string) {
    // Silently ignore lexer errors — we still use whatever tokens were produced
    try {
      this.tokens = new Lexer(source).tokenize();
    } catch {
      // On unexpected characters the real Lexer throws; return an empty stream
      // so the scanner still produces a (possibly empty) DocumentAST.
      this.tokens = [
        {
          type: TokenType.EOF,
          value: "",
          loc: { line: 0, col: 0, offset: 0 },
        } as Token,
      ];
    }
  }

  // ── Primitives ─────────────────────────────────────────────────────────────

  private peek(): Token {
    return (
      this.tokens[this.pos] ?? {
        type: TokenType.EOF,
        value: "",
        loc: { line: 0, col: 0, offset: 0 },
      }
    );
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.type !== TokenType.EOF) this.pos++;
    return tok;
  }

  private isEOF(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private isIdentifier(tok: Token): boolean {
    // Identifiers and block keywords (e.g. "entity") can appear as names/values
    return (
      tok.type === TokenType.IDENTIFIER || KEYWORD_TO_KIND.has(tok.type)
    );
  }

  // ── Block body helpers ─────────────────────────────────────────────────────

  /**
   * Advance past all tokens until the current block closes (brace depth 0).
   * Assumes the opening `{` has already been consumed.
   * Stops early if a top-level block keyword appears at depth 1 that is NOT
   * followed by ':', indicating a new block started (missing `}`).
   */
  private skipBlock(): void {
    let depth = 1;
    while (!this.isEOF() && depth > 0) {
      const t = this.peek();
      // Stop if a new block keyword appears (not as a property key) at depth 1
      if (depth === 1 && KEYWORD_TO_KIND.has(t.type)) {
        const nextTok = this.tokens[this.pos + 1];
        if (!nextTok || nextTok.type !== TokenType.COLON) return;
      }
      this.advance();
      if (t.type === TokenType.LBRACE) depth++;
      else if (t.type === TokenType.RBRACE) depth--;
    }
  }

  /**
   * Scan entity fields from inside a block body (opening `{` already consumed).
   * Returns a map of fieldName → typeString, stopping at depth 0.
   *
   * Entity field syntax:  fieldName: TypeName [@modifiers] [{ config }]
   * We scan greedily and skip any tokens we don't recognise.
   */
  private scanEntityFields(): Record<string, string> {
    const fields: Record<string, string> = {};
    let depth = 1; // we're already inside the entity block

    while (!this.isEOF() && depth > 0) {
      const tok = this.peek();

      if (tok.type === TokenType.LBRACE) {
        this.advance();
        depth++;
        continue;
      }
      if (tok.type === TokenType.RBRACE) {
        this.advance();
        depth--;
        continue;
      }

      // Table-level directives (@@index, @@unique) — skip the rest of the line
      if (tok.type === TokenType.AT_AT_DIRECTIVE) {
        this.advance();
        // Skip until next identifier at depth=1 (crude, but safe)
        continue;
      }

      // If we encounter a top-level block keyword at depth 1, it may be either:
      //   a) A property key:  `entity: Todo` inside a crud block   → followed by ':'
      //   b) A new block:     `entity GoodEntity {` after a missing '}' → not followed by ':'
      // Only stop scanning in case (b).
      if (depth === 1 && KEYWORD_TO_KIND.has(tok.type)) {
        const nextTok = this.tokens[this.pos + 1];
        if (!nextTok || nextTok.type !== TokenType.COLON) {
          return fields; // New block starting — current block was malformed
        }
        // Fall through: it's a property key (e.g., `entity: ...` in a crud sub-block)
      }

      // Only try to read a field declaration at depth 1
      if (depth !== 1) {
        this.advance();
        continue;
      }

      // Expect: fieldName: TypeName
      if (!this.isIdentifier(tok)) {
        this.advance();
        continue;
      }

      const fieldNameTok = this.advance(); // consume field name
      const fieldName = fieldNameTok.value;

      // Next must be ":"
      if (this.peek().type !== TokenType.COLON) continue;
      this.advance(); // consume ":"

      // Next must be an identifier (the type name)
      const typeTok = this.peek();
      if (!this.isIdentifier(typeTok)) continue;
      this.advance(); // consume type name

      const typeName = typeTok.value;
      if (fieldName) fields[fieldName] = typeName;

      // Skip any modifiers on this field (@id, @nullable, @default(...), etc.)
      // and any field config block ({ label: ... })
      // They will be consumed by the outer depth loop on subsequent iterations.
    }

    return fields;
  }

  /**
   * Scan a simple block body (opening `{` already consumed) looking for
   * key: value pairs at depth 1. Returns when depth reaches 0.
   */
  private scanProperties(): Record<string, string> {
    const props: Record<string, string> = {};
    let depth = 1;

    while (!this.isEOF() && depth > 0) {
      const tok = this.peek();

      if (tok.type === TokenType.LBRACE) {
        this.advance();
        depth++;
        continue;
      }
      if (tok.type === TokenType.RBRACE) {
        this.advance();
        depth--;
        continue;
      }

      // If we see a block keyword at depth 1, it may be a property key
      // (e.g., `entity: Todo` inside a crud block) or the start of a new
      // block (when the current block is missing its closing `}`).
      // Distinguish by checking whether the NEXT token is ':'.
      if (depth === 1 && KEYWORD_TO_KIND.has(tok.type)) {
        const nextTok = this.tokens[this.pos + 1];
        if (!nextTok || nextTok.type !== TokenType.COLON) {
          return props; // New block starting — current block was malformed
        }
        // Fall through: treat as a property key
      }

      // Only capture key:value at top depth
      if (depth !== 1 || !this.isIdentifier(tok)) {
        this.advance();
        continue;
      }

      const keyTok = this.advance();
      if (this.peek().type !== TokenType.COLON) continue;
      this.advance(); // consume ":"

      const valTok = this.peek();
      if (
        valTok.type === TokenType.IDENTIFIER ||
        valTok.type === TokenType.STRING ||
        valTok.type === TokenType.BOOLEAN ||
        valTok.type === TokenType.NUMBER ||
        KEYWORD_TO_KIND.has(valTok.type)
      ) {
        this.advance();
        const raw = valTok.value;
        // Strip surrounding quotes from string values
        props[keyTok.value] =
          valTok.type === TokenType.STRING ? raw.slice(1, -1) : raw;
      }
    }

    return props;
  }

  // ── Top-level scan ────────────────────────────────────────────────────────

  scan(): DocumentAST {
    const blocks: BlockSummary[] = [];

    while (!this.isEOF()) {
      const kwTok = this.peek();
      const kind = KEYWORD_TO_KIND.get(kwTok.type as TokenType);

      if (kind === undefined) {
        this.advance(); // skip unknown / whitespace tokens
        continue;
      }

      this.advance(); // consume block keyword

      // Read block name (must be an identifier)
      const nameTok = this.peek();
      if (!this.isIdentifier(nameTok)) {
        // No name — skip until we might be at a new block
        continue;
      }
      this.advance(); // consume name

      const block: BlockSummary = {
        kind,
        name: nameTok.value,
        nameOffset: nameTok.loc.offset,
        nameLength: nameTok.value.length,
      };

      // Skip any tokens between name and opening brace
      while (!this.isEOF() && this.peek().type !== TokenType.LBRACE) {
        // If we hit another block keyword before a `{`, the block is malformed
        if (KEYWORD_TO_KIND.has(this.peek().type as TokenType)) break;
        this.advance();
      }

      if (this.peek().type !== TokenType.LBRACE) {
        // Malformed block — push what we have and move on
        blocks.push(block);
        continue;
      }
      this.advance(); // consume "{"

      // Extract block-specific details
      switch (kind) {
        case "entity": {
          // Scan fields (increments/decrements depth internally)
          block.fields = this.scanEntityFields();
          break;
        }
        case "route": {
          const props = this.scanProperties();
          if (props["to"]) block.toPage = props["to"];
          break;
        }
        case "crud": {
          const props = this.scanProperties();
          if (props["entity"]) block.entityRef = props["entity"];
          break;
        }
        default:
          // For all other block types we only need kind + name
          this.skipBlock();
          break;
      }

      blocks.push(block);
    }

    return { blocks };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a .vasp source string and return a lightweight DocumentAST.
 * Drop-in replacement for the old Chevrotain-based parseDocument().
 * Never throws; any lexer errors are silently ignored.
 */
export function parseDocument(source: string): {
  ast: DocumentAST;
  errors: string[];
} {
  const ast = new Scanner(source).scan();
  // The real diagnostics come from @vasp-framework/parser via diagnostics.ts.
  // The scanner itself never produces LSP-level errors.
  return { ast, errors: [] };
}
