/**
 * document-store.ts — Workspace-wide .vasp document cache.
 *
 * Maintains a Map<uri, ParsedDocument> for all open and workspace .vasp files.
 * The document store is used by the definition feature to resolve cross-file
 * entity and page references.
 */

import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseDocument, type DocumentAST } from "../grammar/VaspCstVisitor.js";

export interface ParsedDocument {
  uri: string;
  version: number;
  ast: DocumentAST;
  /** Raw parse error messages (not yet Diagnostic objects) */
  errors: string[];
  /** Millisecond timestamp of last parse */
  parsedAt: number;
}

/** Central document store shared by all LSP features */
export class VaspDocumentStore {
  private readonly cache = new Map<string, ParsedDocument>();
  private readonly documents: TextDocuments<TextDocument>;

  constructor(documents: TextDocuments<TextDocument>) {
    this.documents = documents;
  }

  /** Parse (or re-parse) a document and cache the result */
  async update(
    uri: string,
    text: string,
    version: number,
  ): Promise<ParsedDocument> {
    const { ast, errors } = parseDocument(text);
    const doc: ParsedDocument = {
      uri,
      version,
      ast,
      errors,
      parsedAt: Date.now(),
    };
    this.cache.set(uri, doc);
    return doc;
  }

  /** Get cached document — returns null if not yet parsed */
  get(uri: string): ParsedDocument | null {
    return this.cache.get(uri) ?? null;
  }

  /** Remove a document from the cache when it's closed */
  remove(uri: string): void {
    this.cache.delete(uri);
  }

  /** All currently cached documents */
  all(): ParsedDocument[] {
    return Array.from(this.cache.values());
  }

  /**
   * Look up entity names across all workspace documents.
   * Returns { name, uri } tuples.
   */
  allEntities(): Array<{ name: string; uri: string; offset?: number }> {
    const results: Array<{ name: string; uri: string; offset?: number }> = [];
    for (const doc of this.all()) {
      for (const block of doc.ast.blocks) {
        if (block.kind === "entity") {
          const entry: { name: string; uri: string; offset?: number } = {
            name: block.name,
            uri: doc.uri,
          };
          if (block.nameOffset !== undefined) entry.offset = block.nameOffset;
          results.push(entry);
        }
      }
    }
    return results;
  }

  /**
   * Look up page names across all workspace documents.
   */
  allPages(): Array<{ name: string; uri: string; offset?: number }> {
    const results: Array<{ name: string; uri: string; offset?: number }> = [];
    for (const doc of this.all()) {
      for (const block of doc.ast.blocks) {
        if (block.kind === "page") {
          const entry: { name: string; uri: string; offset?: number } = {
            name: block.name,
            uri: doc.uri,
          };
          if (block.nameOffset !== undefined) entry.offset = block.nameOffset;
          results.push(entry);
        }
      }
    }
    return results;
  }

  /**
   * Find the entity fields for a given entity name (workspace-wide lookup).
   * Returns null if entity not found.
   */
  entityFields(entityName: string): Record<string, string> | null {
    for (const doc of this.all()) {
      for (const block of doc.ast.blocks) {
        if (
          block.kind === "entity" &&
          block.name === entityName &&
          block.fields
        ) {
          return block.fields;
        }
      }
    }
    return null;
  }

  /** Sync currently-open TextDocuments into the cache */
  async syncOpenDocuments(): Promise<void> {
    for (const doc of this.documents.all()) {
      if (doc.uri.endsWith(".vasp")) {
        const cached = this.cache.get(doc.uri);
        if (!cached || cached.version < doc.version) {
          await this.update(doc.uri, doc.getText(), doc.version);
        }
      }
    }
  }
}
