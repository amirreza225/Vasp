/**
 * server.ts — Vasp Language Server entry point.
 *
 * Creates the LSP connection, registers all feature handlers, and starts
 * the server loop. This file is the `main` entrypoint of the package.
 *
 * The server communicates over stdio and supports:
 *   - Diagnostics (syntax + semantic errors) with 300 ms debounce
 *   - Completions (context-aware, 15+ context states)
 *   - Hover documentation for all keywords and modifiers
 *   - Go-to-definition for entity and page cross-references
 */

import type { InitializeResult } from "vscode-languageserver/node.js";
import {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { VaspDocumentStore } from "./utils/document-store.js";
import { registerDiagnosticsHandler } from "./features/diagnostics.js";
import { registerCompletionsHandler } from "./features/completions.js";
import { registerHoverHandler } from "./features/hover.js";
import { registerDefinitionHandler } from "./features/definition.js";

// ── Connection & document manager ─────────────────────────────────────────────

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const store = new VaspDocumentStore(documents);

// ── Initialize ────────────────────────────────────────────────────────────────

connection.onInitialize((): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        triggerCharacters: [":", " ", "\n", "{"],
        resolveProvider: true,
      },
      hoverProvider: true,
      definitionProvider: true,
    },
    serverInfo: {
      name: "vasp-language-server",
      version: "0.1.0",
    },
  };
});

connection.onInitialized(async () => {
  await store.syncOpenDocuments();
});

// ── Feature registrations ─────────────────────────────────────────────────────

registerDiagnosticsHandler(connection, store, documents);
registerCompletionsHandler(connection, documents, store);
registerHoverHandler(connection, documents);
registerDefinitionHandler(connection, documents, store);

// ── Start ─────────────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
