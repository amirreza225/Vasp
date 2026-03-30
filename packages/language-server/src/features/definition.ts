/**
 * definition.ts — Go-to-definition for entity and page cross-references.
 *
 * Supports:
 *   - `entity: Todo` in a crud block → jumps to `entity Todo { ... }`
 *   - `to: HomePage` in a route block → jumps to `page HomePage { ... }`
 *   - Works across multiple .vasp files in the workspace (multi-file support)
 */

import {
  Connection,
  Location,
  Position,
  Range,
  TextDocuments,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { VaspDocumentStore } from "../utils/document-store.js";

/** Convert character offset to LSP Position */
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

/** Regex to extract the identifier word at a cursor position */
const WORD_RE = /\b\w+\b/g;

function wordAtOffset(text: string, offset: number): string | null {
  WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(text)) !== null) {
    if (match.index <= offset && offset <= match.index + match[0].length) {
      return match[0];
    }
  }
  return null;
}

/** Register definition handler on the LSP connection */
export function registerDefinitionHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  store: VaspDocumentStore,
): void {
  connection.onDefinition((params): Location | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc || !params.textDocument.uri.endsWith(".vasp")) return null;

    const text = doc.getText();
    const offset = doc.offsetAt(params.position);
    const word = wordAtOffset(text, offset);
    if (!word) return null;

    // Check if cursor is after `entity:`, `to:`, or `userEntity:` — value-reference context
    const textBefore = text.slice(0, offset);
    const isRef =
      /(?:entity|to|userEntity)\s*:\s*\w*$/.test(textBefore) ||
      /entity\s*:\s*\w+$/.test(textBefore);

    if (!isRef) return null;

    // Look up entity or page definition across workspace
    for (const docInfo of store.all()) {
      for (const block of docInfo.ast.blocks) {
        if (
          (block.kind === "entity" || block.kind === "page") &&
          block.name === word
        ) {
          // Find the declaration in the target document's text to get accurate position
          const targetDoc = documents.get(docInfo.uri);
          if (targetDoc) {
            const targetText = targetDoc.getText();
            const declPattern = new RegExp(
              `\\b(?:entity|page)\\s+(${word})\\b`,
            );
            const match = declPattern.exec(targetText);
            if (match && match.index !== undefined) {
              const nameStart = match.index + match[0].indexOf(word);
              const nameEnd = nameStart + word.length;
              return Location.create(docInfo.uri, Range.create(
                offsetToPosition(targetText, nameStart),
                offsetToPosition(targetText, nameEnd),
              ));
            }
          }
          // Fallback: start of file
          return Location.create(docInfo.uri, Range.create(
            Position.create(0, 0),
            Position.create(0, 0),
          ));
        }
      }
    }

    return null;
  });
}
