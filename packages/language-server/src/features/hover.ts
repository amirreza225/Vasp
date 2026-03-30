/**
 * hover.ts — Hover documentation for keywords, modifiers, and field types.
 *
 * When the user hovers over a keyword like `executor`, `entity`, `@id`, or
 * a type like `String`, we look up the documentation in vasp-docs.ts and
 * return it as a MarkupContent (Markdown) hover response.
 */

import {
  Connection,
  Hover,
  MarkupContent,
  MarkupKind,
  TextDocuments,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDoc } from "../utils/vasp-docs.js";

/** Regex to extract the word under cursor (including leading @) */
const WORD_RE = /@?\w+/g;

/** Extract the word at a given offset in text */
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

function buildHoverContent(word: string): MarkupContent | null {
  const doc = getDoc(word);
  if (!doc) return null;
  return {
    kind: MarkupKind.Markdown,
    value: doc.documentation,
  };
}

/** Register hover handler on the LSP connection */
export function registerHoverHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onHover((params): Hover | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc || !params.textDocument.uri.endsWith(".vasp")) return null;

    const text = doc.getText();
    const offset = doc.offsetAt(params.position);
    const word = wordAtOffset(text, offset);
    if (!word) return null;

    const contents = buildHoverContent(word);
    if (!contents) return null;

    return { contents };
  });
}
