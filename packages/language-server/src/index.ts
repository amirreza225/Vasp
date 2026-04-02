/**
 * index.ts — Public API of the language-server package.
 *
 * Re-exports the key building blocks so they can be unit-tested
 * and consumed by the VS Code extension client (Phase 4).
 */

export {
  parseDocument,
  type BlockSummary,
  type DocumentAST,
} from "./grammar/VaspDocScanner.js";
export {
  detectCursorContext,
  type CursorContext,
} from "./utils/context-detector.js";
export {
  VaspDocumentStore,
  type ParsedDocument,
} from "./utils/document-store.js";
export { VASP_DOCS, getDoc, type VaspDocEntry } from "./utils/vasp-docs.js";
export { validateDocument } from "./features/diagnostics.js";
export { getCompletions } from "./features/completions.js";
