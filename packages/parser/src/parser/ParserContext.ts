import type { ImportExpression, SourceLocation } from "@vasp-framework/core";
import type { ParseError } from "@vasp-framework/core";
import type { Token } from "../lexer/Token.js";
import type { TokenType } from "../lexer/TokenType.js";

/**
 * Interface shared by the main Parser and exposed to every block-level
 * sub-parser function.  All token-consumer primitives and shared
 * value-parsers live here so each block file can be self-contained.
 */
export interface IParserContext {
  /** Return the token at the current position (or a synthetic EOF). */
  peek(): Token;

  /** Return true if the current token has the given type. */
  check(type: TokenType): boolean;

  /** Return true if the token stream is exhausted. */
  isEOF(): boolean;

  /**
   * Look ahead by `n` positions past the current cursor.
   * Returns undefined when the index is out of bounds.
   */
  lookahead(n: number): Token | undefined;

  /**
   * Consume and return the current token, asserting its type.
   * Throws a ParseError when the type doesn't match.
   */
  consume(type: TokenType): Token;

  /**
   * Consume the current token as an identifier.
   * Also accepts block-keyword tokens when they appear in value position.
   * Throws a ParseError when the token is neither an IDENTIFIER nor a
   * block keyword.
   */
  consumeIdentifier(): Token;

  /**
   * Consume the current token as a STRING literal and return its value.
   * Throws a ParseError when the token is not a STRING.
   */
  consumeString(): string;

  /** Build a ParseError with a structured diagnostic. */
  error(
    code: string,
    message: string,
    hint: string,
    loc?: SourceLocation,
  ): ParseError;

  // ---- Shared value parsers ----

  /** Parses `[ident, ident, …]` and returns the identifier strings. */
  parseIdentifierArray(): string[];

  /** Parses `["str", "str", …]` and returns the string values. */
  parseStringArray(): string[];

  /**
   * Parses either:
   *   import name from "path"
   *   import { name } from "path"
   */
  parseImportExpression(): ImportExpression;

  /**
   * Parses `env(VAR_NAME)` and returns the env-var name string.
   * Throws when the token is not in that form.
   */
  parseEnvRef(): string;
}
