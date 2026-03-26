export enum TokenType {
  // Keywords (top-level block starters)
  KW_APP = "app",
  KW_AUTH = "auth",
  KW_ENTITY = "entity",
  KW_ROUTE = "route",
  KW_PAGE = "page",
  KW_QUERY = "query",
  KW_ACTION = "action",
  KW_API = "api",
  KW_MIDDLEWARE = "middleware",
  KW_CRUD = "crud",
  KW_REALTIME = "realtime",
  KW_JOB = "job",
  KW_SEED = "seed",
  KW_ADMIN = "admin",
  KW_STORAGE = "storage",

  // Value-position keywords
  KW_IMPORT = "import",
  KW_FROM = "from",

  // Literals
  IDENTIFIER = "IDENTIFIER",
  STRING = "STRING",
  BOOLEAN = "BOOLEAN",
  NUMBER = "NUMBER",

  // Field modifier: @id, @unique, @default(now)
  AT_MODIFIER = "AT_MODIFIER",

  // Punctuation
  LBRACE = "{",
  RBRACE = "}",
  LBRACKET = "[",
  RBRACKET = "]",
  LPAREN = "(",
  RPAREN = ")",
  COLON = ":",
  COMMA = ",",

  // Meta
  EOF = "EOF",
}

/** Keywords that start a top-level declaration block */
export const BLOCK_KEYWORDS = new Set<string>([
  TokenType.KW_APP,
  TokenType.KW_AUTH,
  TokenType.KW_ENTITY,
  TokenType.KW_ROUTE,
  TokenType.KW_PAGE,
  TokenType.KW_QUERY,
  TokenType.KW_ACTION,
  TokenType.KW_API,
  TokenType.KW_MIDDLEWARE,
  TokenType.KW_CRUD,
  TokenType.KW_REALTIME,
  TokenType.KW_JOB,
  TokenType.KW_SEED,
  TokenType.KW_ADMIN,
  TokenType.KW_STORAGE,
]);

/** All reserved keywords (cannot be used as identifiers in value position) */
export const ALL_KEYWORDS = new Set<string>([
  ...BLOCK_KEYWORDS,
  TokenType.KW_IMPORT,
  TokenType.KW_FROM,
]);
