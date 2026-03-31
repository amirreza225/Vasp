/**
 * diagnostics.ts — Parse and validate .vasp documents, publish Diagnostic[]
 *
 * Triggered by onDidChangeTextDocument (debounced 300 ms).
 *
 * Uses @vasp-framework/parser directly (parseAll) so that the FULL
 * SemanticValidator runs — surfacing all E100–E126+ error codes in the
 * editor rather than the small subset the old Chevrotain-only checker covered.
 *
 * The Chevrotain grammar/parser is retained in grammar/ exclusively for the
 * document store (completions, hover, go-to-definition) where its fault-
 * tolerant CST is needed.
 */

import type {
  Connection,
  Diagnostic,
  TextDocuments,
} from "vscode-languageserver";
import { DiagnosticSeverity, Range, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { parseAll } from "@vasp-framework/parser";
import type { VaspDocumentStore } from "../utils/document-store.js";

/** Convert a 0-based character offset in `text` to a LSP Position. */
function offsetToPosition(text: string, offset: number): Position {
  const clamped = Math.min(offset, text.length);
  let line = 0;
  let char = 0;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === "\n") {
      line++;
      char = 0;
    } else {
      char++;
    }
  }
  return Position.create(line, char);
}

function offsetToRange(text: string, start: number, end: number): Range {
  return Range.create(
    offsetToPosition(text, start),
    offsetToPosition(text, end),
  );
}

/**
 * Find the end offset of the identifier/word that starts at `start` in `text`.
 * Falls back to `start + 1` for non-word characters so the range is at least
 * one character wide (avoids zero-width squiggles).
 */
function wordEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && /\w/.test(text[end]!)) end++;
  return end > start ? end : start + 1;
}

/**
 * Run the full Vasp parser + SemanticValidator on `text` and return
 * LSP Diagnostic[].
 *
 * By delegating to @vasp-framework/parser's parseAll() all semantic error
 * codes (E100–E126+) are surfaced in the editor. Previously only a small
 * subset (missing app, route/page refs, crud/entity refs, realtime/crud refs)
 * was checked here.
 */
export function validateDocument(text: string): Diagnostic[] {
  const { diagnostics: parseDiags } = parseAll(text, "main.vasp");

  return parseDiags.map((diag) => {
    const offset = diag.loc?.offset ?? 0;
    const end = wordEnd(text, offset);
    // Error codes starting with "E" are errors; others (warnings, info) are warnings.
    const severity = diag.code.startsWith("E")
      ? DiagnosticSeverity.Error
      : DiagnosticSeverity.Warning;
    // Include the hint in the message so it surfaces in the editor tooltip.
    const message = diag.hint
      ? `${diag.message}\n\nHint: ${diag.hint}`
      : diag.message;
    return {
      severity,
      range: offsetToRange(text, offset, end),
      message,
      code: diag.code,
      source: "vasp",
    };
  });
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 300;

/** Register diagnostics handler on the LSP connection */
export function registerDiagnosticsHandler(
  connection: Connection,
  store: VaspDocumentStore,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onDidChangeTextDocument(async (params) => {
    const uri = params.textDocument.uri;
    if (!uri.endsWith(".vasp")) return;

    // Clear previous debounce timer
    const prev = debounceTimers.get(uri);
    if (prev) clearTimeout(prev);

    const timer = setTimeout(async () => {
      debounceTimers.delete(uri);
      // Get the full document text from the document manager (handles both full and incremental updates)
      const doc = documents.get(uri);
      if (!doc) return; // Document closed between keystroke and debounce firing
      const text = doc.getText();
      await store.update(uri, text, params.textDocument.version);
      const diagnostics = validateDocument(text);
      connection.sendDiagnostics({ uri, diagnostics });
    }, DEBOUNCE_MS);

    debounceTimers.set(uri, timer);
  });

  connection.onDidOpenTextDocument(async (params) => {
    const uri = params.textDocument.uri;
    if (!uri.endsWith(".vasp")) return;
    const text = params.textDocument.text;
    await store.update(uri, text, params.textDocument.version);
    const diagnostics = validateDocument(text);
    connection.sendDiagnostics({ uri, diagnostics });
  });

  connection.onDidCloseTextDocument((params) => {
    const uri = params.textDocument.uri;
    store.remove(uri);
    connection.sendDiagnostics({ uri, diagnostics: [] });
  });
}
