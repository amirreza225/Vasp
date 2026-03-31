/**
 * VaspParser — Chevrotain CstParser for the full Vasp v2 DSL grammar.
 *
 * Produces a Concrete Syntax Tree (CST) used by VaspCstVisitor to build
 * a VaspAST (from @vasp-framework/core). The parser is fault-tolerant —
 * Chevrotain's built-in error recovery ensures partial CSTs are still
 * produced for incomplete/broken documents so the LSP can report diagnostics
 * at the actual error site rather than failing the entire file.
 */

import { CstParser } from "chevrotain";
import {
  Action,
  Admin,
  Api,
  App,
  AtAtDirective,
  AtModifier,
  Auth,
  AutoPage,
  BooleanType,
  BullMQ,
  Cache,
  Colon,
  Columns,
  Comma,
  Crud,
  Custom,
  DateTimeType,
  Default,
  Description,
  Email,
  Entity,
  EnumType,
  False,
  Filterable,
  FileType,
  FloatType,
  Form,
  From,
  Hidden,
  Identifier,
  Import,
  IntType,
  Job,
  JsonType,
  Kafka,
  Label,
  Layout,
  LBrace,
  LBracket,
  LParen,
  List,
  Max,
  MaxLength,
  Middleware,
  Min,
  MinLength,
  NumberLiteral,
  Observability,
  Page,
  Paginate,
  Pattern,
  Permissions,
  PgBoss,
  Placeholder,
  Query,
  RabbitMQ,
  RBrace,
  RBracket,
  Realtime,
  RedisStreams,
  Required,
  Route,
  RParen,
  Search,
  Sections,
  Seed,
  Sortable,
  Steps,
  Storage,
  StringLiteral,
  StringType,
  TextType,
  True,
  Validate,
  Webhook,
  Width,
  ALL_TOKENS,
} from "./VaspLexer.js";

export class VaspParser extends CstParser {
  constructor() {
    super(ALL_TOKENS, {
      recoveryEnabled: true,
      maxLookahead: 4,
    });
    this.performSelfAnalysis();
  }

  // ── Top-level ─────────────────────────────────────────────────────────────

  readonly vaspFile = this.RULE("vaspFile", () => {
    this.MANY(() => {
      this.SUBRULE(this.blockDecl);
    });
  });

  readonly blockDecl = this.RULE("blockDecl", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.appBlock) },
      { ALT: () => this.SUBRULE(this.authBlock) },
      { ALT: () => this.SUBRULE(this.entityBlock) },
      { ALT: () => this.SUBRULE(this.routeBlock) },
      { ALT: () => this.SUBRULE(this.pageBlock) },
      { ALT: () => this.SUBRULE(this.queryBlock) },
      { ALT: () => this.SUBRULE(this.actionBlock) },
      { ALT: () => this.SUBRULE(this.apiBlock) },
      { ALT: () => this.SUBRULE(this.middlewareBlock) },
      { ALT: () => this.SUBRULE(this.crudBlock) },
      { ALT: () => this.SUBRULE(this.realtimeBlock) },
      { ALT: () => this.SUBRULE(this.jobBlock) },
      { ALT: () => this.SUBRULE(this.seedBlock) },
      { ALT: () => this.SUBRULE(this.adminBlock) },
      { ALT: () => this.SUBRULE(this.storageBlock) },
      { ALT: () => this.SUBRULE(this.emailBlock) },
      { ALT: () => this.SUBRULE(this.cacheBlock) },
      { ALT: () => this.SUBRULE(this.webhookBlock) },
      { ALT: () => this.SUBRULE(this.observabilityBlock) },
      { ALT: () => this.SUBRULE(this.autoPageBlock) },
    ]);
  });

  // ── app block ─────────────────────────────────────────────────────────────

  readonly appBlock = this.RULE("appBlock", () => {
    this.CONSUME(App);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  // ── auth block ────────────────────────────────────────────────────────────

  readonly authBlock = this.RULE("authBlock", () => {
    this.CONSUME(Auth);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  // ── entity block ─────────────────────────────────────────────────────────

  readonly entityBlock = this.RULE("entityBlock", () => {
    this.CONSUME(Entity);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.fieldDecl) },
        { ALT: () => this.SUBRULE(this.tableDirective) },
      ]);
    });
    this.CONSUME(RBrace);
  });

  readonly fieldDecl = this.RULE("fieldDecl", () => {
    this.CONSUME(Identifier, { LABEL: "fieldName" });
    this.CONSUME(Colon);
    this.SUBRULE(this.fieldType);
    this.MANY(() => this.CONSUME(AtModifier));
    this.OPTION(() => this.SUBRULE(this.fieldConfigBlock));
  });

  readonly fieldType = this.RULE("fieldType", () => {
    this.OR([
      { ALT: () => this.CONSUME(StringType) },
      { ALT: () => this.CONSUME(IntType) },
      { ALT: () => this.CONSUME(BooleanType) },
      { ALT: () => this.CONSUME(DateTimeType) },
      { ALT: () => this.CONSUME(FloatType) },
      { ALT: () => this.CONSUME(TextType) },
      { ALT: () => this.CONSUME(JsonType) },
      { ALT: () => this.SUBRULE(this.enumFieldType) },
      { ALT: () => this.CONSUME(FileType) },
      { ALT: () => this.CONSUME(Identifier, { LABEL: "entityRef" }) },
    ]);
  });

  readonly enumFieldType = this.RULE("enumFieldType", () => {
    this.CONSUME(EnumType);
    this.CONSUME(LParen);
    this.CONSUME(Identifier, { LABEL: "variant" });
    this.MANY(() => {
      this.CONSUME(Comma);
      this.CONSUME2(Identifier, { LABEL: "variant" });
    });
    this.CONSUME(RParen);
  });

  readonly fieldConfigBlock = this.RULE("fieldConfigBlock", () => {
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.fieldConfigProp));
    this.CONSUME(RBrace);
  });

  readonly fieldConfigProp = this.RULE("fieldConfigProp", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Label);
          this.CONSUME(Colon);
          this.CONSUME(StringLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Placeholder);
          this.CONSUME2(Colon);
          this.CONSUME2(StringLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Description);
          this.CONSUME3(Colon);
          this.CONSUME3(StringLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Default);
          this.CONSUME4(Colon);
          this.SUBRULE(this.anyValue);
        },
      },
      { ALT: () => this.SUBRULE(this.validateBlock) },
    ]);
  });

  readonly validateBlock = this.RULE("validateBlock", () => {
    this.CONSUME(Validate);
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.validateProp));
    this.CONSUME(RBrace);
  });

  readonly validateProp = this.RULE("validateProp", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Required);
          this.CONSUME(Colon);
          this.SUBRULE(this.boolValue);
        },
      },
      {
        ALT: () => {
          this.CONSUME(MinLength);
          this.CONSUME2(Colon);
          this.CONSUME(NumberLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(MaxLength);
          this.CONSUME3(Colon);
          this.CONSUME2(NumberLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Min);
          this.CONSUME4(Colon);
          this.CONSUME3(NumberLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Max);
          this.CONSUME5(Colon);
          this.CONSUME4(NumberLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Pattern);
          this.CONSUME6(Colon);
          this.CONSUME(StringLiteral, { LABEL: "value" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(Custom);
          this.CONSUME7(Colon);
          this.CONSUME2(StringLiteral, { LABEL: "value" });
        },
      },
    ]);
  });

  readonly tableDirective = this.RULE("tableDirective", () => {
    this.CONSUME(AtAtDirective);
  });

  // ── crud block ────────────────────────────────────────────────────────────

  readonly crudBlock = this.RULE("crudBlock", () => {
    this.CONSUME(Crud);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.crudListBlock) },
        { ALT: () => this.SUBRULE(this.crudFormBlock) },
        { ALT: () => this.SUBRULE(this.crudPermissionsBlock) },
        { ALT: () => this.SUBRULE(this.property) },
      ]);
    });
    this.CONSUME(RBrace);
  });

  readonly crudListBlock = this.RULE("crudListBlock", () => {
    this.CONSUME(List);
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.crudColumnsBlock) },
        { ALT: () => this.SUBRULE(this.property) },
      ]);
    });
    this.CONSUME(RBrace);
  });

  readonly crudColumnsBlock = this.RULE("crudColumnsBlock", () => {
    this.CONSUME(Columns);
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.columnDecl));
    this.CONSUME(RBrace);
  });

  readonly columnDecl = this.RULE("columnDecl", () => {
    this.CONSUME(Identifier, { LABEL: "fieldName" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly crudFormBlock = this.RULE("crudFormBlock", () => {
    this.CONSUME(Form);
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.crudSectionsBlock) },
        { ALT: () => this.SUBRULE(this.crudStepsBlock) },
        { ALT: () => this.SUBRULE(this.property) },
      ]);
    });
    this.CONSUME(RBrace);
  });

  readonly crudSectionsBlock = this.RULE("crudSectionsBlock", () => {
    this.CONSUME(Sections);
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.sectionDecl));
    this.CONSUME(RBrace);
  });

  readonly crudStepsBlock = this.RULE("crudStepsBlock", () => {
    this.CONSUME(Steps);
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.sectionDecl));
    this.CONSUME(RBrace);
  });

  readonly sectionDecl = this.RULE("sectionDecl", () => {
    this.CONSUME(Identifier, { LABEL: "sectionName" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly crudPermissionsBlock = this.RULE("crudPermissionsBlock", () => {
    this.CONSUME(Permissions);
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  // ── Remaining top-level blocks (flat property bags) ───────────────────────

  readonly routeBlock = this.RULE("routeBlock", () => {
    this.CONSUME(Route);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly pageBlock = this.RULE("pageBlock", () => {
    this.CONSUME(Page);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly queryBlock = this.RULE("queryBlock", () => {
    this.CONSUME(Query);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly actionBlock = this.RULE("actionBlock", () => {
    this.CONSUME(Action);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly apiBlock = this.RULE("apiBlock", () => {
    this.CONSUME(Api);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly middlewareBlock = this.RULE("middlewareBlock", () => {
    this.CONSUME(Middleware);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly realtimeBlock = this.RULE("realtimeBlock", () => {
    this.CONSUME(Realtime);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly jobBlock = this.RULE("jobBlock", () => {
    this.CONSUME(Job);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.jobPerformBlock) },
        { ALT: () => this.SUBRULE(this.property) },
      ]);
    });
    this.CONSUME(RBrace);
  });

  readonly jobPerformBlock = this.RULE("jobPerformBlock", () => {
    this.CONSUME(Identifier, { LABEL: "keyword" }); // "perform"
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly seedBlock = this.RULE("seedBlock", () => {
    this.CONSUME(Seed);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly adminBlock = this.RULE("adminBlock", () => {
    this.CONSUME(Admin);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly storageBlock = this.RULE("storageBlock", () => {
    this.CONSUME(Storage);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly emailBlock = this.RULE("emailBlock", () => {
    this.CONSUME(Email);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.emailTemplatesBlock) },
        { ALT: () => this.SUBRULE(this.property) },
      ]);
    });
    this.CONSUME(RBrace);
  });

  readonly emailTemplatesBlock = this.RULE("emailTemplatesBlock", () => {
    this.CONSUME(Identifier, { LABEL: "keyword" }); // "templates"
    this.CONSUME(LBracket);
    this.MANY(() => {
      this.SUBRULE(this.emailTemplateEntry);
      this.OPTION(() => this.CONSUME(Comma));
    });
    this.CONSUME(RBracket);
  });

  readonly emailTemplateEntry = this.RULE("emailTemplateEntry", () => {
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly cacheBlock = this.RULE("cacheBlock", () => {
    this.CONSUME(Cache);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly webhookBlock = this.RULE("webhookBlock", () => {
    this.CONSUME(Webhook);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly observabilityBlock = this.RULE("observabilityBlock", () => {
    this.CONSUME(Observability);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  readonly autoPageBlock = this.RULE("autoPageBlock", () => {
    this.CONSUME(AutoPage);
    this.CONSUME(Identifier, { LABEL: "name" });
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.property));
    this.CONSUME(RBrace);
  });

  // ── Generic property (key: value) ─────────────────────────────────────────

  readonly property = this.RULE("property", () => {
    this.SUBRULE(this.propertyKey);
    this.CONSUME(Colon);
    this.SUBRULE(this.anyValue);
  });

  readonly propertyKey = this.RULE("propertyKey", () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(Label) },
      { ALT: () => this.CONSUME(Placeholder) },
      { ALT: () => this.CONSUME(Description) },
      { ALT: () => this.CONSUME(Layout) },
      { ALT: () => this.CONSUME(Hidden) },
      { ALT: () => this.CONSUME(Width) },
      { ALT: () => this.CONSUME(Paginate) },
      { ALT: () => this.CONSUME(Sortable) },
      { ALT: () => this.CONSUME(Filterable) },
      { ALT: () => this.CONSUME(Search) },
      { ALT: () => this.CONSUME(Required) },
      { ALT: () => this.CONSUME(MinLength) },
      { ALT: () => this.CONSUME(MaxLength) },
      { ALT: () => this.CONSUME(Min) },
      { ALT: () => this.CONSUME(Max) },
      { ALT: () => this.CONSUME(Pattern) },
      { ALT: () => this.CONSUME(Custom) },
      { ALT: () => this.CONSUME(Default) },
    ]);
  });

  readonly anyValue = this.RULE("anyValue", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.importExpr) },
      { ALT: () => this.SUBRULE(this.arrayValue) },
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.SUBRULE(this.boolValue) },
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(PgBoss) },
      { ALT: () => this.CONSUME(BullMQ) },
      { ALT: () => this.CONSUME(RedisStreams) },
      { ALT: () => this.CONSUME(RabbitMQ) },
      { ALT: () => this.CONSUME(Kafka) },
    ]);
  });

  readonly boolValue = this.RULE("boolValue", () => {
    this.OR([
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
    ]);
  });

  readonly arrayValue = this.RULE("arrayValue", () => {
    this.CONSUME(LBracket);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => {
        this.OR([
          { ALT: () => this.CONSUME(StringLiteral) },
          { ALT: () => this.CONSUME(Identifier) },
        ]);
      },
    });
    this.CONSUME(RBracket);
  });

  readonly importExpr = this.RULE("importExpr", () => {
    this.CONSUME(Import);
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Identifier, { LABEL: "defaultImport" });
        },
      },
      {
        ALT: () => {
          this.CONSUME(LBrace);
          this.CONSUME2(Identifier, { LABEL: "namedImport" });
          this.OPTION(() => {
            this.CONSUME(Comma);
            this.CONSUME3(Identifier, { LABEL: "namedImport" });
          });
          this.CONSUME(RBrace);
        },
      },
    ]);
    this.CONSUME(From);
    this.CONSUME(StringLiteral, { LABEL: "modulePath" });
  });
}

/** Singleton parser instance — reused across calls for performance */
let _parser: VaspParser | null = null;

export function getVaspParser(): VaspParser {
  if (!_parser) {
    _parser = new VaspParser();
  }
  return _parser;
}
