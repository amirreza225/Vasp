/**
 * diagnostics.ts — Parse and validate .vasp documents, publish Diagnostic[]
 *
 * Triggered by onDidChangeTextDocument (debounced 300 ms).
 * Runs Chevrotain lexer + parser to collect syntax errors, then runs
 * a lightweight semantic check (undefined entity/page references).
 */

import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
  TextDocuments,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { VaspLexer } from "../grammar/VaspLexer.js";
import { getVaspParser } from "../grammar/VaspParser.js";
import { getVaspVisitor, type DocumentAST } from "../grammar/VaspCstVisitor.js";
import type { VaspDocumentStore } from "../utils/document-store.js";

/** Convert a character offset to a LSP Position */
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

/** Run lexer + parser on `text` and return Diagnostic[] */
export function validateDocument(text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // ── Lex ──────────────────────────────────────────────────────────────────
  const lexResult = VaspLexer.tokenize(text);
  for (const err of lexResult.errors) {
    const start = err.offset ?? 0;
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: offsetToRange(text, start, start + (err.length ?? 1)),
      message: err.message,
      source: "vasp",
    });
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  const parser = getVaspParser();
  parser.input = lexResult.tokens;
  const cst = parser.vaspFile();

  for (const err of parser.errors) {
    const token = err.token;
    const start = token?.startOffset ?? 0;
    const end = token?.endOffset !== undefined ? token.endOffset + 1 : start + 1;
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: offsetToRange(text, start, end),
      message: err.message,
      source: "vasp",
    });
  }

  // ── Semantic ──────────────────────────────────────────────────────────────
  try {
    const visitor = getVaspVisitor();
    const ast = visitor.visit(cst) as DocumentAST;
    const semanticDiags = semanticCheck(text, ast);
    diagnostics.push(...semanticDiags);
  } catch {
    // If visitor fails due to severe parse errors, skip semantic checks
  }

  return diagnostics;
}

/** Lightweight semantic checks on the simplified DocumentAST */
function semanticCheck(text: string, ast: DocumentAST): Diagnostic[] {
  const diags: Diagnostic[] = [];

  const entityNames = new Set(
    ast.blocks.filter((b) => b.kind === "entity").map((b) => b.name),
  );
  const pageNames = new Set(
    ast.blocks.filter((b) => b.kind === "page").map((b) => b.name),
  );

  let hasApp = false;

  for (const block of ast.blocks) {
    if (block.kind === "app") {
      if (hasApp) {
        // Duplicate app block
        const idx = text.indexOf("app " + block.name);
        if (idx !== -1) {
          diags.push({
            severity: DiagnosticSeverity.Error,
            range: offsetToRange(text, idx, idx + 3),
            message: "Only one 'app' block is allowed per file.",
            source: "vasp",
          });
        }
      }
      hasApp = true;
    }

    // Route "to:" page reference must exist
    if (block.kind === "route" && block.toPage) {
      if (!pageNames.has(block.toPage)) {
        const idx = text.indexOf(block.toPage, text.indexOf(block.name));
        if (idx !== -1) {
          diags.push({
            severity: DiagnosticSeverity.Error,
            range: offsetToRange(text, idx, idx + block.toPage.length),
            message: `Page '${block.toPage}' is not declared. Add a 'page ${block.toPage} { ... }' block.`,
            source: "vasp",
          });
        }
      }
    }

    // CRUD entity reference must exist
    if (block.kind === "crud" && block.entityRef) {
      if (!entityNames.has(block.entityRef)) {
        const idx = text.indexOf(block.entityRef, text.indexOf(block.name));
        if (idx !== -1) {
          diags.push({
            severity: DiagnosticSeverity.Error,
            range: offsetToRange(text, idx, idx + block.entityRef.length),
            message: `Entity '${block.entityRef}' is not declared. Add an 'entity ${block.entityRef} { ... }' block.`,
            source: "vasp",
          });
        }
      }
    }

    // Realtime entity reference must have a matching crud block
    if (block.kind === "realtime") {
      const hasCrud = ast.blocks.some(
        (b) => b.kind === "crud" && b.entityRef === block.name,
      );
      if (!hasCrud) {
        const idx = text.indexOf("realtime " + block.name);
        if (idx !== -1) {
          diags.push({
            severity: DiagnosticSeverity.Warning,
            range: offsetToRange(text, idx, idx + ("realtime " + block.name).length),
            message: `Realtime block '${block.name}' has no matching 'crud' block. Add a 'crud' block with entity referencing the same entity name.`,
            source: "vasp",
          });
        }
      }
    }
  }

  return diags;
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
