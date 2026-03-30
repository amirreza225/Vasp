/**
 * context-detector.ts — Determines the current cursor context within a .vasp document.
 *
 * Given a document text and a cursor offset (character position), it walks backwards
 * through the text to detect what block/sub-block the cursor is in, enabling the
 * completions feature to offer context-appropriate suggestions.
 */

export type CursorContext =
  | { type: "top-level" }
  | { type: "app"; blockName: string }
  | { type: "entity"; blockName: string }
  | { type: "entity-field-type"; blockName: string; fieldName: string }
  | { type: "entity-field-modifier"; blockName: string; fieldName: string }
  | { type: "entity-field-config"; blockName: string; fieldName: string }
  | { type: "entity-field-validate"; blockName: string; fieldName: string }
  | { type: "crud"; blockName: string }
  | { type: "crud-list"; blockName: string }
  | { type: "crud-columns"; blockName: string }
  | { type: "crud-column-decl"; blockName: string; columnName: string }
  | { type: "crud-form"; blockName: string }
  | { type: "crud-sections"; blockName: string }
  | { type: "crud-steps"; blockName: string }
  | { type: "crud-permissions"; blockName: string }
  | { type: "after-colon"; blockKind: string; key: string; blockName: string }
  | { type: "job"; blockName: string }
  | { type: "job-executor"; blockName: string }
  | { type: "storage"; blockName: string }
  | { type: "email"; blockName: string }
  | { type: "cache"; blockName: string }
  | { type: "auth"; blockName: string }
  | { type: "observability"; blockName: string }
  | { type: "unknown" };

/** Regex that matches a block opener like `entity Foo {` or `crud Bar {` */
const BLOCK_OPENER_RE =
  /\b(app|auth|entity|route|page|query|action|api|middleware|crud|realtime|job|seed|admin|storage|email|cache|webhook|observability|autoPage)\s+(\w+)\s*\{/g;

/**
 * Detect the cursor context by scanning backward from the cursor offset.
 * Returns a CursorContext that completions.ts uses to produce relevant items.
 */
export function detectCursorContext(
  source: string,
  cursorOffset: number,
): CursorContext {
  const textBeforeCursor = source.slice(0, cursorOffset);

  // Walk through all block openers and find the deepest one that encloses the cursor
  const stack: Array<{ kind: string; name: string; start: number }> = [];
  const re = new RegExp(BLOCK_OPENER_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(textBeforeCursor)) !== null) {
    const matchStart = match.index;
    const kind = match[1] ?? "";
    const name = match[2] ?? "";
    // Close any blocks whose brace was closed before this match
    // Count braces between last stack entry start and this match to see if previous block closed
    const lastEntry = stack[stack.length - 1];
    if (lastEntry) {
      const segment = textBeforeCursor.slice(lastEntry.start, matchStart);
      const depth = countBraceDepth(segment);
      if (depth <= 0) {
        stack.pop();
      }
    }
    stack.push({ kind, name, start: matchStart });
  }

  // Now determine actual nesting depth by counting braces from the outermost block
  if (stack.length === 0) return { type: "top-level" };

  // Find which block we're actually inside by counting net brace depth from block start
  let currentBlock = stack[stack.length - 1];
  if (!currentBlock) return { type: "top-level" };

  // Find the opening brace of this block
  const blockOpenIdx = textBeforeCursor.indexOf("{", currentBlock.start);
  if (blockOpenIdx === -1) return { type: "top-level" };

  const insideBlock = textBeforeCursor.slice(blockOpenIdx + 1);
  const netDepth = countBraceDepth(insideBlock);
  if (netDepth < 0) {
    // Cursor is outside this block — back to top-level
    return { type: "top-level" };
  }

  const kind = currentBlock.kind;
  const blockName = currentBlock.name;

  // After-colon detection (check first — applies in all block kinds)
  const afterColonMatch = /(\w+)\s*:\s*$/.exec(insideBlock);
  if (afterColonMatch) {
    const key = afterColonMatch[1] ?? "";
    return { type: "after-colon", blockKind: kind, key, blockName };
  }

  // Detect sub-block context within crud
  if (kind === "crud") {
    if (isInsideSubBlock(insideBlock, "list")) {
      if (
        isInsideSubBlock(getSubBlockContent(insideBlock, "list"), "columns")
      ) {
        return { type: "crud-columns", blockName };
      }
      return { type: "crud-list", blockName };
    }
    if (isInsideSubBlock(insideBlock, "form")) {
      const formContent = getSubBlockContent(insideBlock, "form");
      if (isInsideSubBlock(formContent, "sections"))
        return { type: "crud-sections", blockName };
      if (isInsideSubBlock(formContent, "steps"))
        return { type: "crud-steps", blockName };
      return { type: "crud-form", blockName };
    }
    if (isInsideSubBlock(insideBlock, "permissions")) {
      return { type: "crud-permissions", blockName };
    }
    return { type: "crud", blockName };
  }

  // Detect entity sub-contexts
  if (kind === "entity") {
    // Check if inside a field config block (field { ... })
    const fieldConfigMatch =
      /\b(\w+)\s*:\s*\w[\w(,\s)]*(?:\s+@\w+(?:\([^)]*\))?)* *\{([^}]*)$/.exec(
        insideBlock,
      );
    if (fieldConfigMatch) {
      const fieldName = fieldConfigMatch[1] ?? "";
      const configContent = fieldConfigMatch[2] ?? "";
      if (/\bvalidate\s*\{[^}]*$/.test(configContent)) {
        return { type: "entity-field-validate", blockName, fieldName };
      }
      return { type: "entity-field-config", blockName, fieldName };
    }
    return { type: "entity", blockName };
  }

  // Map block kinds to context types
  const kindMap: Record<string, CursorContext["type"]> = {
    job: "job",
    storage: "storage",
    email: "email",
    cache: "cache",
    auth: "auth",
    observability: "observability",
    app: "app",
  };
  const mappedType = kindMap[kind];
  if (mappedType) return { type: mappedType, blockName } as CursorContext;

  return { type: "unknown" };
}

/** Count net brace depth: +1 for { -1 for }. Ignores braces inside strings/comments. */
function countBraceDepth(text: string): number {
  let depth = 0;
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === "/" && text[i + 1] === "/") {
        // Skip line comment
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      } else if (ch === "/" && text[i + 1] === "*") {
        // Skip block comment — advance past `/*` then scan for `*/`
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/"))
          i++;
        if (i < text.length) i += 2; // advance past `*/` only if found
        continue;
      } else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    i++;
  }
  return depth;
}

/** Check if cursor is inside a named sub-block (e.g. `list {`) */
function isInsideSubBlock(content: string, keyword: string): boolean {
  const re = new RegExp(`\\b${keyword}\\s*\\{`);
  const match = re.exec(content);
  if (!match) return false;
  const afterOpen = content.slice(match.index + match[0].length);
  return countBraceDepth(afterOpen) >= 0;
}

/** Get the text content inside a named sub-block */
function getSubBlockContent(content: string, keyword: string): string {
  const re = new RegExp(`\\b${keyword}\\s*\\{`);
  const match = re.exec(content);
  if (!match) return "";
  return content.slice(match.index + match[0].length);
}
