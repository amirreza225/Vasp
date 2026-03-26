import type { ParseDiagnostic } from "@vasp-framework/core";

// ANSI color codes (work in Bun/Node terminals)
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _proc = (globalThis as any).process as
  | { env?: Record<string, string>; stdout?: { isTTY?: boolean } }
  | undefined;
const NO_COLOR = _proc?.env?.NO_COLOR !== undefined || !_proc?.stdout?.isTTY;

function clr(code: string, text: string): string {
  return NO_COLOR ? text : `${code}${text}${c.reset}`;
}

/**
 * Format a list of ParseDiagnostics as Rust-style diagnostic output.
 *
 * Example:
 * ```
 * error[E101_UNKNOWN_PAGE_REF]: Route 'HomeRoute' references unknown page 'HomePage'
 *  --> main.vasp:5:3
 *   |
 * 5 |   to: HomePage
 *   |   ^^ unknown page 'HomePage'
 *   |
 *   = hint: Add a page block named 'HomePage', or fix the 'to' value in route 'HomeRoute'
 * ```
 */
export function formatDiagnostics(
  diagnostics: ParseDiagnostic[],
  source: string,
  filename = "main.vasp",
): string {
  const lines = source.split("\n");
  return diagnostics.map((d) => formatOne(d, lines, filename)).join("\n\n");
}

function formatOne(
  d: ParseDiagnostic,
  lines: string[],
  filename: string,
): string {
  const header =
    clr(c.red + c.bold, `error[${d.code}]`) + clr(c.bold, `: ${d.message}`);

  if (!d.loc || d.loc.line === 0) {
    // No source location — just show the message and hint
    const hint = `   ${clr(c.cyan, "= hint:")} ${d.hint}`;
    return `${header}\n${hint}`;
  }

  const { line, col } = d.loc;
  const lineNum = line;
  const colNum = col;

  // Grab context lines (1 before, the error line, 1 after)
  const errorLineText = lines[lineNum - 1] ?? "";
  const prevLineText = lineNum > 1 ? lines[lineNum - 2] : null;
  const nextLineText = lines[lineNum] ?? null;

  const maxLineNumW = String(lineNum + (nextLineText ? 1 : 0)).length;
  const pad = (n: number | string) => String(n).padStart(maxLineNumW, " ");
  const gutter = clr(c.cyan, "|");

  const locationLine = `  ${clr(c.cyan, "-->")} ${filename}:${lineNum}:${colNum}`;
  const blankGutter = `${pad("")} ${gutter}`;

  const parts: string[] = [header, locationLine, ` ${blankGutter}`];

  if (prevLineText !== null) {
    parts.push(` ${clr(c.dim, `${pad(lineNum - 1)} |`)} ${prevLineText}`);
  }

  // The error line itself
  parts.push(` ${clr(c.cyan, `${pad(lineNum)} |`)} ${errorLineText}`);

  // Caret line — try to point at the problematic token
  // col is 1-based; we place carets starting at col
  const caretCol = Math.max(0, colNum - 1);
  const caretLen = guessTokenLength(errorLineText, caretCol);
  const caret =
    " ".repeat(caretCol) + clr(c.red + c.bold, "^".repeat(caretLen));
  parts.push(` ${pad("")} ${gutter} ${caret}`);

  if (nextLineText !== null && nextLineText.trim() !== "") {
    parts.push(` ${clr(c.dim, `${pad(lineNum + 1)} |`)} ${nextLineText}`);
  }

  parts.push(` ${blankGutter}`);
  parts.push(`   ${clr(c.cyan, "= hint:")} ${d.hint}`);

  return parts.join("\n");
}

/**
 * Guess the length of the token at position `col` in `line`.
 * Falls back to 1 if nothing useful found.
 */
function guessTokenLength(line: string, col: number): number {
  const rest = line.slice(col);
  const match = rest.match(/^[A-Za-z_][\w]*/);
  if (match) return match[0].length;
  const strMatch = rest.match(/^["'][^"']*["']/);
  if (strMatch) return strMatch[0].length;
  return Math.max(1, rest.match(/^\S+/)?.[0].length ?? 1);
}
