import type { ParseDiagnostic, VaspAST } from "@vasp-framework/core";
import { ParseError } from "@vasp-framework/core";
import { parse as _parse } from "./parser/Parser.js";
import { SemanticValidator } from "./validator/SemanticValidator.js";

/**
 * Parse a .vasp source string into a validated VaspAST.
 * Throws ParseError on any syntax or semantic error.
 */
export function parse(source: string, filename = "main.vasp"): VaspAST {
  const ast = _parse(source, filename);
  new SemanticValidator().validate(ast);
  return ast;
}

/**
 * Parse a .vasp source string and return all diagnostics (errors and warnings)
 * without throwing. Useful for linting tools that need to display warnings even
 * when the file has no errors, and for the `vasp validate --strict` command.
 *
 * Syntax errors from the raw parser are caught and surfaced as diagnostics.
 */
export function parseAll(
  source: string,
  filename = "main.vasp",
): { ast: VaspAST | null; diagnostics: ParseDiagnostic[]; hasErrors: boolean } {
  let ast: VaspAST;
  try {
    ast = _parse(source, filename);
  } catch (err) {
    if (err instanceof ParseError) {
      return { ast: null, diagnostics: err.diagnostics, hasErrors: true };
    }
    throw err;
  }
  const diagnostics = new SemanticValidator().collectDiagnostics(ast);
  const hasErrors = diagnostics.some((d) => d.code.startsWith("E"));
  return { ast: hasErrors ? null : ast, diagnostics, hasErrors };
}

export { Lexer } from "./lexer/Lexer.js";
export { SemanticValidator } from "./validator/SemanticValidator.js";
export { formatDiagnostics } from "./errors/DiagnosticFormatter.js";
export { AstSerializer } from "./serializer/AstSerializer.js";
export type { Token } from "./lexer/Token.js";
export { TokenType } from "./lexer/TokenType.js";
