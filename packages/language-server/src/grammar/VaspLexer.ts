/**
 * VaspLexer — Chevrotain token definitions for the Vasp DSL.
 *
 * All 50+ tokens required by the language server grammar are defined here.
 * The CLI parser (packages/parser) is kept independent per Q3 decision.
 */

import { createToken, Lexer } from "chevrotain";

// ── Whitespace / Comments (skipped) ──────────────────────────────────────────

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

export const LineComment = createToken({
  name: "LineComment",
  pattern: /\/\/.*/,
  group: Lexer.SKIPPED,
});

export const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
  line_breaks: true,
});

// ── Top-level block keywords ──────────────────────────────────────────────────

export const App = createToken({ name: "App", pattern: /app(?=\s)/ });
export const Auth = createToken({ name: "Auth", pattern: /auth(?=\s)/ });
export const Entity = createToken({ name: "Entity", pattern: /entity(?=\s)/ });
export const Route = createToken({ name: "Route", pattern: /route(?=\s)/ });
export const Page = createToken({ name: "Page", pattern: /page(?=\s)/ });
export const Query = createToken({ name: "Query", pattern: /query(?=\s)/ });
export const Action = createToken({ name: "Action", pattern: /action(?=\s)/ });
export const Api = createToken({ name: "Api", pattern: /api(?=\s)/ });
export const Middleware = createToken({ name: "Middleware", pattern: /middleware(?=\s)/ });
export const Crud = createToken({ name: "Crud", pattern: /crud(?=\s)/ });
export const Realtime = createToken({ name: "Realtime", pattern: /realtime(?=\s)/ });
export const Job = createToken({ name: "Job", pattern: /job(?=\s)/ });
export const Seed = createToken({ name: "Seed", pattern: /seed(?=\s)/ });
export const Admin = createToken({ name: "Admin", pattern: /admin(?=\s)/ });
export const Storage = createToken({ name: "Storage", pattern: /storage(?=\s)/ });
export const Email = createToken({ name: "Email", pattern: /email(?=\s)/ });
export const Cache = createToken({ name: "Cache", pattern: /cache(?=\s)/ });
export const Webhook = createToken({ name: "Webhook", pattern: /webhook(?=\s)/ });
export const Observability = createToken({ name: "Observability", pattern: /observability(?=\s)/ });
export const AutoPage = createToken({ name: "AutoPage", pattern: /autoPage(?=\s)/ });

// ── Nested sub-block keywords ─────────────────────────────────────────────────

export const List = createToken({ name: "List", pattern: /list(?=\s*\{)/ });
export const Columns = createToken({ name: "Columns", pattern: /columns(?=\s*\{)/ });
export const Form = createToken({ name: "Form", pattern: /form(?=\s*\{)/ });
export const Sections = createToken({ name: "Sections", pattern: /sections(?=\s*\{)/ });
export const Steps = createToken({ name: "Steps", pattern: /steps(?=\s*\{)/ });
export const Permissions = createToken({ name: "Permissions", pattern: /permissions(?=\s*\{)/ });
export const Validate = createToken({ name: "Validate", pattern: /validate(?=\s*\{)/ });

// ── Property keywords ─────────────────────────────────────────────────────────

export const Layout = createToken({ name: "Layout", pattern: /layout(?=\s*:)/ });
export const Label = createToken({ name: "Label", pattern: /label(?=\s*:)/ });
export const Placeholder = createToken({ name: "Placeholder", pattern: /placeholder(?=\s*:)/ });
export const Description = createToken({ name: "Description", pattern: /description(?=\s*:)/ });
export const Hidden = createToken({ name: "Hidden", pattern: /hidden(?=\s*:)/ });
export const Width = createToken({ name: "Width", pattern: /width(?=\s*:)/ });
export const Paginate = createToken({ name: "Paginate", pattern: /paginate(?=\s*:)/ });
export const Sortable = createToken({ name: "Sortable", pattern: /sortable(?=\s*:|\s*\[)/ });
export const Filterable = createToken({ name: "Filterable", pattern: /filterable(?=\s*:|\s*\[)/ });
export const Search = createToken({ name: "Search", pattern: /search(?=\s*:|\s*\[)/ });
export const Required = createToken({ name: "Required", pattern: /required(?=\s*:)/ });
export const MinLength = createToken({ name: "MinLength", pattern: /minLength(?=\s*:)/ });
export const MaxLength = createToken({ name: "MaxLength", pattern: /maxLength(?=\s*:)/ });
export const Min = createToken({ name: "Min", pattern: /min(?=\s*:)/ });
export const Max = createToken({ name: "Max", pattern: /max(?=\s*:)/ });
export const Pattern = createToken({ name: "Pattern", pattern: /pattern(?=\s*:)/ });
export const Custom = createToken({ name: "Custom", pattern: /custom(?=\s*:)/ });

// ── Value-position keywords ───────────────────────────────────────────────────

export const Import = createToken({ name: "Import", pattern: /import(?=\s)/ });
export const From = createToken({ name: "From", pattern: /from(?=\s)/ });
export const Default = createToken({ name: "Default", pattern: /default(?=\s*:)/ });

// ── Primitive field types ─────────────────────────────────────────────────────

export const StringType = createToken({ name: "StringType", pattern: /String(?!\w)/ });
export const IntType = createToken({ name: "IntType", pattern: /Int(?!\w)/ });
export const BooleanType = createToken({ name: "BooleanType", pattern: /Boolean(?!\w)/ });
export const DateTimeType = createToken({ name: "DateTimeType", pattern: /DateTime(?!\w)/ });
export const FloatType = createToken({ name: "FloatType", pattern: /Float(?!\w)/ });
export const TextType = createToken({ name: "TextType", pattern: /Text(?!\w)/ });
export const JsonType = createToken({ name: "JsonType", pattern: /Json(?!\w)/ });
export const EnumType = createToken({ name: "EnumType", pattern: /Enum(?=\()/ });
export const FileType = createToken({ name: "FileType", pattern: /File(?!\w)/ });

// ── Executors / Providers ─────────────────────────────────────────────────────

export const PgBoss = createToken({ name: "PgBoss", pattern: /PgBoss/ });
export const BullMQ = createToken({ name: "BullMQ", pattern: /BullMQ/ });
export const RedisStreams = createToken({ name: "RedisStreams", pattern: /RedisStreams/ });
export const RabbitMQ = createToken({ name: "RabbitMQ", pattern: /RabbitMQ/ });
export const Kafka = createToken({ name: "Kafka", pattern: /Kafka/ });

// ── Boolean literals ──────────────────────────────────────────────────────────

export const True = createToken({ name: "True", pattern: /true/ });
export const False = createToken({ name: "False", pattern: /false/ });

// ── String literals ───────────────────────────────────────────────────────────

export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"(?:[^"\\]|\\.)*"/,
  line_breaks: false,
});

// ── Number literals ───────────────────────────────────────────────────────────

export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?(?:0|[1-9]\d*)(?:\.\d+)?/,
});

// ── Modifiers (@id, @unique, @@index, etc.) ───────────────────────────────────

export const AtAtDirective = createToken({
  name: "AtAtDirective",
  pattern: /@@\w+/,
});

export const AtModifier = createToken({
  name: "AtModifier",
  pattern: /@\w+(?:\([^)]*\))?/,
});

// ── Punctuation ───────────────────────────────────────────────────────────────

export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });

// ── Identifier (must come after all keywords) ─────────────────────────────────

export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

// ── Ordered token list — ORDER MATTERS for Chevrotain ────────────────────────
// More specific patterns must come before less specific ones.

export const ALL_TOKENS = [
  WhiteSpace,
  LineComment,
  BlockComment,

  // Multi-char punctuation first
  AtAtDirective,
  AtModifier,

  // Sub-block keywords (lookahead-constrained, before Identifier)
  List,
  Columns,
  Form,
  Sections,
  Steps,
  Permissions,
  Validate,

  // Property keywords (lookahead-constrained, before Identifier)
  Layout,
  Label,
  Placeholder,
  Description,
  Hidden,
  Width,
  Paginate,
  Sortable,
  Filterable,
  Search,
  Required,
  MinLength,
  MaxLength,
  Min,
  Max,
  Pattern,
  Custom,
  Default,

  // Top-level block keywords (lookahead-constrained, before Identifier)
  App,
  Auth,
  Entity,
  Route,
  Page,
  Query,
  Action,
  Api,
  Middleware,
  Crud,
  Realtime,
  Job,
  Seed,
  Admin,
  Storage,
  Email,
  Cache,
  Webhook,
  Observability,
  AutoPage,

  // Value-position keywords
  Import,
  From,

  // Primitive types (before Identifier)
  StringType,
  IntType,
  BooleanType,
  DateTimeType,
  FloatType,
  TextType,
  JsonType,
  EnumType,
  FileType,

  // Executors / Providers
  PgBoss,
  BullMQ,
  RedisStreams,
  RabbitMQ,
  Kafka,

  // Literals
  True,
  False,
  StringLiteral,
  NumberLiteral,

  // Identifier (must be last among word-like tokens)
  Identifier,

  // Punctuation
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  LParen,
  RParen,
  Colon,
  Comma,
];

export const VaspLexer = new Lexer(ALL_TOKENS, {
  recoveryEnabled: true,
  ensureOptimizations: false,
});
