/**
 * VaspCstVisitor — converts a Chevrotain CST to a lightweight summary AST.
 *
 * We don't attempt to produce the full VaspAST (from @vasp-framework/core) since
 * that requires the complete CLI parser logic. Instead, this visitor produces a
 * simplified DocumentAST that contains just enough information for the LSP features:
 *   - What block types exist and their names
 *   - Entity field names and types
 *   - CRUD entity references
 *   - Route page references
 * This is sufficient for go-to-definition, completions, and diagnostics.
 */

import { CstNode, IToken } from "chevrotain";
import { VaspLexer } from "./VaspLexer.js";
import { getVaspParser } from "./VaspParser.js";

const parser = getVaspParser();
const BaseCstVisitorConstructor =
  parser.getBaseCstVisitorConstructorWithDefaults();

/** Lightweight block summary used by LSP features */
export interface BlockSummary {
  kind:
    | "app"
    | "auth"
    | "entity"
    | "route"
    | "page"
    | "query"
    | "action"
    | "api"
    | "middleware"
    | "crud"
    | "realtime"
    | "job"
    | "seed"
    | "admin"
    | "storage"
    | "email"
    | "cache"
    | "webhook"
    | "observability"
    | "autoPage";
  name: string;
  /** For entity blocks: field name → type string */
  fields?: Record<string, string>;
  /** For route blocks: "to" page name */
  toPage?: string;
  /** For crud blocks: entity name reference */
  entityRef?: string;
  /** Character offset range of the name token */
  nameOffset?: number;
  nameLength?: number;
}

export interface DocumentAST {
  blocks: BlockSummary[];
}

class VaspCstVisitorClass extends BaseCstVisitorConstructor {
  constructor() {
    super();
    this.validateVisitor();
  }

  vaspFile(ctx: Record<string, CstNode[]>): DocumentAST {
    const blocks: BlockSummary[] = [];
    for (const decl of ctx["blockDecl"] ?? []) {
      const result = this.visit(decl) as BlockSummary | null;
      if (result) blocks.push(result);
    }
    return { blocks };
  }

  blockDecl(ctx: Record<string, CstNode[]>): BlockSummary | null {
    const children = Object.values(ctx).flat();
    if (children.length > 0 && children[0]) {
      return this.visit(children[0]) as BlockSummary | null;
    }
    return null;
  }

  appBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "app", name: nameToken?.image ?? "" };
  }

  authBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "auth", name: nameToken?.image ?? "" };
  }

  entityBlock(ctx: Record<string, CstNode[] | IToken[]>): BlockSummary {
    const nameToken = (ctx["name"] as IToken[])?.[0];
    const fields: Record<string, string> = {};
    for (const field of (ctx["fieldDecl"] as CstNode[] | undefined) ?? []) {
      const { name: fName, type: fType } = this.visit(field) as {
        name: string;
        type: string;
      };
      if (fName) fields[fName] = fType;
    }
    const base: BlockSummary = {
      kind: "entity",
      name: nameToken?.image ?? "",
      fields,
    };
    if (nameToken?.startOffset !== undefined)
      base.nameOffset = nameToken.startOffset;
    if (nameToken?.image !== undefined)
      base.nameLength = nameToken.image.length;
    return base;
  }

  fieldDecl(ctx: Record<string, CstNode[] | IToken[]>): {
    name: string;
    type: string;
  } {
    const nameToken = (ctx["fieldName"] as IToken[])?.[0];
    const typeCst = (ctx["fieldType"] as CstNode[])?.[0];
    const typeName = typeCst ? (this.visit(typeCst) as string) : "unknown";
    return { name: nameToken?.image ?? "", type: typeName };
  }

  fieldType(ctx: Record<string, IToken[] | CstNode[]>): string {
    if ((ctx["StringType"] as IToken[])?.[0]) return "String";
    if ((ctx["IntType"] as IToken[])?.[0]) return "Int";
    if ((ctx["BooleanType"] as IToken[])?.[0]) return "Boolean";
    if ((ctx["DateTimeType"] as IToken[])?.[0]) return "DateTime";
    if ((ctx["FloatType"] as IToken[])?.[0]) return "Float";
    if ((ctx["TextType"] as IToken[])?.[0]) return "Text";
    if ((ctx["JsonType"] as IToken[])?.[0]) return "Json";
    if ((ctx["FileType"] as IToken[])?.[0]) return "File";
    if ((ctx["enumFieldType"] as CstNode[])?.[0]) return "Enum";
    const entityRef = (ctx["entityRef"] as IToken[])?.[0];
    return entityRef?.image ?? "unknown";
  }

  enumFieldType(_ctx: unknown): string {
    return "Enum";
  }

  fieldConfigBlock(_ctx: unknown): null {
    return null;
  }

  fieldConfigProp(_ctx: unknown): null {
    return null;
  }

  validateBlock(_ctx: unknown): null {
    return null;
  }

  validateProp(_ctx: unknown): null {
    return null;
  }

  tableDirective(_ctx: unknown): null {
    return null;
  }

  routeBlock(ctx: Record<string, CstNode[] | IToken[]>): BlockSummary {
    const nameToken = (ctx["name"] as IToken[])?.[0];
    // Look for "to" in properties
    let toPage: string | undefined;
    for (const prop of (ctx["property"] as CstNode[] | undefined) ?? []) {
      const p = this.visit(prop) as { key: string; value: string } | null;
      if (p?.key === "to") toPage = p.value;
    }
    const base: BlockSummary = { kind: "route", name: nameToken?.image ?? "" };
    if (toPage !== undefined) base.toPage = toPage;
    return base;
  }

  pageBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    const base: BlockSummary = { kind: "page", name: nameToken?.image ?? "" };
    if (nameToken?.startOffset !== undefined)
      base.nameOffset = nameToken.startOffset;
    if (nameToken?.image !== undefined)
      base.nameLength = nameToken.image.length;
    return base;
  }

  queryBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "query", name: nameToken?.image ?? "" };
  }

  actionBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "action", name: nameToken?.image ?? "" };
  }

  apiBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "api", name: nameToken?.image ?? "" };
  }

  middlewareBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "middleware", name: nameToken?.image ?? "" };
  }

  crudBlock(ctx: Record<string, CstNode[] | IToken[]>): BlockSummary {
    const nameToken = (ctx["name"] as IToken[])?.[0];
    let entityRef: string | undefined;
    for (const prop of (ctx["property"] as CstNode[] | undefined) ?? []) {
      const p = this.visit(prop) as { key: string; value: string } | null;
      if (p?.key === "entity") entityRef = p.value;
    }
    const base: BlockSummary = { kind: "crud", name: nameToken?.image ?? "" };
    if (entityRef !== undefined) base.entityRef = entityRef;
    return base;
  }

  crudListBlock(_ctx: unknown): null {
    return null;
  }

  crudColumnsBlock(_ctx: unknown): null {
    return null;
  }

  columnDecl(_ctx: unknown): null {
    return null;
  }

  crudFormBlock(_ctx: unknown): null {
    return null;
  }

  crudSectionsBlock(_ctx: unknown): null {
    return null;
  }

  crudStepsBlock(_ctx: unknown): null {
    return null;
  }

  sectionDecl(_ctx: unknown): null {
    return null;
  }

  crudPermissionsBlock(_ctx: unknown): null {
    return null;
  }

  realtimeBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "realtime", name: nameToken?.image ?? "" };
  }

  jobBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "job", name: nameToken?.image ?? "" };
  }

  jobPerformBlock(_ctx: unknown): null {
    return null;
  }

  seedBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "seed", name: nameToken?.image ?? "" };
  }

  adminBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "admin", name: nameToken?.image ?? "" };
  }

  storageBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "storage", name: nameToken?.image ?? "" };
  }

  emailBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "email", name: nameToken?.image ?? "" };
  }

  emailTemplatesBlock(_ctx: unknown): null {
    return null;
  }

  emailTemplateEntry(_ctx: unknown): null {
    return null;
  }

  cacheBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "cache", name: nameToken?.image ?? "" };
  }

  webhookBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "webhook", name: nameToken?.image ?? "" };
  }

  observabilityBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "observability", name: nameToken?.image ?? "" };
  }

  autoPageBlock(ctx: Record<string, IToken[]>): BlockSummary {
    const nameToken = ctx["name"]?.[0];
    return { kind: "autoPage", name: nameToken?.image ?? "" };
  }

  property(
    ctx: Record<string, CstNode[] | IToken[]>,
  ): { key: string; value: string } | null {
    const keyCst = (ctx["propertyKey"] as CstNode[])?.[0];
    const valueCst = (ctx["anyValue"] as CstNode[])?.[0];
    if (!keyCst || !valueCst) return null;
    const key = this.visit(keyCst) as string;
    const value = this.visit(valueCst) as string;
    return { key, value };
  }

  propertyKey(ctx: Record<string, IToken[]>): string {
    const tokens = Object.values(ctx).flat();
    return tokens[0]?.image ?? "";
  }

  anyValue(ctx: Record<string, CstNode[] | IToken[]>): string {
    const str = (ctx["StringLiteral"] as IToken[])?.[0];
    if (str) return str.image.slice(1, -1); // strip quotes
    const num = (ctx["NumberLiteral"] as IToken[])?.[0];
    if (num) return num.image;
    const id = (ctx["Identifier"] as IToken[])?.[0];
    if (id) return id.image;
    const pg = (ctx["PgBoss"] as IToken[])?.[0];
    if (pg) return "PgBoss";
    const bull = (ctx["BullMQ"] as IToken[])?.[0];
    if (bull) return "BullMQ";
    const rs = (ctx["RedisStreams"] as IToken[])?.[0];
    if (rs) return "RedisStreams";
    const rmq = (ctx["RabbitMQ"] as IToken[])?.[0];
    if (rmq) return "RabbitMQ";
    const kfk = (ctx["Kafka"] as IToken[])?.[0];
    if (kfk) return "Kafka";
    const bool = (ctx["boolValue"] as CstNode[])?.[0];
    if (bool) return this.visit(bool) as string;
    const arr = (ctx["arrayValue"] as CstNode[])?.[0];
    if (arr) return this.visit(arr) as string;
    return "";
  }

  boolValue(ctx: Record<string, IToken[]>): string {
    if (ctx["True"]?.[0]) return "true";
    return "false";
  }

  arrayValue(ctx: Record<string, IToken[]>): string {
    const items = [
      ...(ctx["StringLiteral"] ?? []).map((t) => t.image.slice(1, -1)),
      ...(ctx["Identifier"] ?? []).map((t) => t.image),
    ];
    return items.join(",");
  }

  importExpr(ctx: Record<string, IToken[]>): string {
    const mod = ctx["modulePath"]?.[0]?.image ?? '""';
    return mod.slice(1, -1);
  }
}

let _visitor: VaspCstVisitorClass | null = null;

export function getVaspVisitor(): VaspCstVisitorClass {
  if (!_visitor) {
    _visitor = new VaspCstVisitorClass();
  }
  return _visitor;
}

/** Parse a .vasp source text and return a lightweight DocumentAST */
export function parseDocument(source: string): {
  ast: DocumentAST;
  errors: string[];
} {
  const lexResult = VaspLexer.tokenize(source);
  const parser = getVaspParser();
  parser.input = lexResult.tokens;
  const cst = parser.vaspFile();
  const errors: string[] = [
    ...lexResult.errors.map((e: { message: string }) => e.message),
    ...parser.errors.map((e) => e.message),
  ];
  const visitor = getVaspVisitor();
  const ast = visitor.visit(cst) as DocumentAST;
  return { ast, errors };
}
