/**
 * AstSerializer unit tests — verifies that serialised DSL round-trips through
 * the parser without errors and produces the expected output.
 */

import { describe, expect, it } from "vitest";
import { AstSerializer } from "../serializer/AstSerializer.js";
import { parse } from "../index.js";
import type {
  ActionNode,
  AdminNode,
  ApiNode,
  AuthNode,
  AutoPageNode,
  CacheNode,
  CrudNode,
  EmailNode,
  EntityNode,
  JobNode,
  MiddlewareNode,
  ObservabilityNode,
  PageNode,
  QueryNode,
  RealtimeNode,
  RouteNode,
  SeedNode,
  SourceLocation,
  StorageNode,
  WebhookNode,
} from "@vasp-framework/core";

const DUMMY_LOC: SourceLocation = { line: 0, col: 0, offset: 0 };

const MINIMAL_APP = `app TestApp {
  title: "Test"
  db: Drizzle
  ssr: false
  typescript: true
}\n`;

const s = new AstSerializer();

/** Parse a DSL snippet appended to the minimal app block (satisfies E100). */
function parseWith(dsl: string) {
  return parse(MINIMAL_APP + "\n" + dsl, "test.vasp");
}

describe("AstSerializer.serialize — round-trip", () => {
  it("entity with @id and @default(now)", () => {
    const node: EntityNode = {
      type: "Entity",
      name: "Post",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
        {
          name: "title",
          type: "String",
          modifiers: ["unique"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
        {
          name: "createdAt",
          type: "DateTime",
          modifiers: ["default_now"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
          defaultValue: "now",
        },
      ],
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("entity Post {");
    expect(dsl).toContain("id: Int @id");
    expect(dsl).toContain("title: String @unique");
    expect(dsl).toContain("createdAt: DateTime @default(now)");
    // round-trip
    const ast = parseWith(dsl);
    expect(ast.entities).toHaveLength(1);
    expect(ast.entities[0]!.name).toBe("Post");
  });

  it("entity with Enum field and nullable relation", () => {
    const node: EntityNode = {
      type: "Entity",
      name: "Task",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
        {
          name: "status",
          type: "Enum",
          modifiers: [],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
          enumValues: ["open", "done", "archived"],
        },
      ],
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("status: Enum(open, done, archived)");
    const ast = parseWith(dsl);
    expect(ast.entities[0]!.fields[1]!.enumValues).toEqual([
      "open",
      "done",
      "archived",
    ]);
  });

  it("route block", () => {
    const node: RouteNode = {
      type: "Route",
      name: "HomeRoute",
      loc: DUMMY_LOC,
      path: "/",
      to: "HomePage",
      params: [],
    };
    // Needs a matching page to satisfy E101
    const pageNode: PageNode = {
      type: "Page",
      name: "HomePage",
      loc: DUMMY_LOC,
      component: {
        kind: "default",
        defaultExport: "Home",
        source: "@src/pages/Home.vue",
      },
    };
    const dsl = s.serializeMany([node, pageNode]);
    expect(dsl).toContain('path: "/"');
    expect(dsl).toContain("to: HomePage");
    const ast = parseWith(dsl);
    expect(ast.routes[0]!.path).toBe("/");
    expect(ast.pages[0]!.name).toBe("HomePage");
  });

  it("query block", () => {
    const node: QueryNode = {
      type: "Query",
      name: "getTodos",
      loc: DUMMY_LOC,
      fn: { kind: "named", namedExport: "getTodos", source: "@src/queries.ts" },
      entities: [],
      auth: false,
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("query getTodos {");
    expect(dsl).toContain('import { getTodos } from "@src/queries.ts"');
    expect(dsl).toContain("entities: []");
    parseWith(dsl);
  });

  it("action block", () => {
    const node: ActionNode = {
      type: "Action",
      name: "createTodo",
      loc: DUMMY_LOC,
      fn: {
        kind: "named",
        namedExport: "createTodo",
        source: "@src/actions.ts",
      },
      entities: [],
      auth: false,
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("action createTodo {");
    parseWith(dsl);
  });

  it("crud block", () => {
    const entity: EntityNode = {
      type: "Entity",
      name: "Todo",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
      ],
    };
    const node: CrudNode = {
      type: "Crud",
      name: "Todo",
      loc: DUMMY_LOC,
      entity: "Todo",
      operations: ["list", "create", "update", "delete"],
    };
    const dsl = s.serializeMany([entity, node]);
    expect(dsl).toContain("crud Todo {");
    expect(dsl).toContain("operations: [list, create, update, delete]");
    const ast = parseWith(dsl);
    expect(ast.cruds[0]!.operations).toEqual([
      "list",
      "create",
      "update",
      "delete",
    ]);
  });

  it("realtime block", () => {
    // realtime requires a matching crud block
    const entity: EntityNode = {
      type: "Entity",
      name: "Post",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
      ],
    };
    const crud: CrudNode = {
      type: "Crud",
      name: "Post",
      loc: DUMMY_LOC,
      entity: "Post",
      operations: ["list"],
    };
    const node: RealtimeNode = {
      type: "Realtime",
      name: "PostChannel",
      loc: DUMMY_LOC,
      entity: "Post",
      events: ["created", "updated", "deleted"],
    };
    const dsl = s.serializeMany([entity, crud, node]);
    expect(dsl).toContain("realtime PostChannel {");
    expect(dsl).toContain("events: [created, updated, deleted]");
    parseWith(dsl);
  });

  it("job block with perform", () => {
    const node: JobNode = {
      type: "Job",
      name: "sendEmail",
      loc: DUMMY_LOC,
      executor: "PgBoss",
      perform: {
        fn: { kind: "named", namedExport: "sendEmail", source: "@src/jobs.ts" },
      },
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("job sendEmail {");
    expect(dsl).toContain("executor: PgBoss");
    expect(dsl).toContain("perform: {");
    expect(dsl).toContain('import { sendEmail } from "@src/jobs.ts"');
    parseWith(dsl);
  });

  it("job block with retries and schedule", () => {
    const node: JobNode = {
      type: "Job",
      name: "processPayment",
      loc: DUMMY_LOC,
      executor: "BullMQ",
      retries: { limit: 3, backoff: "exponential", delay: 1000 },
      deadLetter: { queue: "failed-payments" },
      perform: {
        fn: {
          kind: "named",
          namedExport: "processPayment",
          source: "@src/jobs.ts",
        },
      },
      schedule: "0 * * * *",
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("retries: {");
    expect(dsl).toContain("limit: 3");
    expect(dsl).toContain("backoff: exponential");
    expect(dsl).toContain('deadLetter: {');
    expect(dsl).toContain('"failed-payments"');
    expect(dsl).toContain('schedule: "0 * * * *"');
    parseWith(dsl);
  });

  it("auth block", () => {
    // auth requires a User entity
    const userEntity: EntityNode = {
      type: "Entity",
      name: "User",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
      ],
    };
    const node: AuthNode = {
      type: "Auth",
      name: "AppAuth",
      loc: DUMMY_LOC,
      userEntity: "User",
      methods: ["usernameAndPassword"],
    };
    const dsl = s.serializeMany([userEntity, node]);
    expect(dsl).toContain("auth AppAuth {");
    expect(dsl).toContain("userEntity: User");
    expect(dsl).toContain("methods: [usernameAndPassword]");
    parseWith(dsl);
  });

  it("api block", () => {
    const node: ApiNode = {
      type: "Api",
      name: "healthCheck",
      loc: DUMMY_LOC,
      method: "GET",
      path: "/api/health",
      fn: {
        kind: "named",
        namedExport: "healthCheck",
        source: "@src/api.ts",
      },
      auth: false,
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("method: GET");
    expect(dsl).toContain('path: "/api/health"');
    parseWith(dsl);
  });

  it("storage block", () => {
    const node: StorageNode = {
      type: "Storage",
      name: "Avatars",
      loc: DUMMY_LOC,
      provider: "s3",
      bucket: "my-avatars",
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("storage Avatars {");
    expect(dsl).toContain("provider: s3");
    expect(dsl).toContain('bucket: "my-avatars"');
    parseWith(dsl);
  });

  it("email block with empty templates", () => {
    const node: EmailNode = {
      type: "Email",
      name: "Mailer",
      loc: DUMMY_LOC,
      provider: "resend",
      from: "noreply@example.com",
      templates: [],
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("email Mailer {");
    expect(dsl).toContain("provider: resend");
    expect(dsl).toContain('from: "noreply@example.com"');
    expect(dsl).toContain("templates: {");
    parseWith(dsl);
  });

  it("cache block — memory", () => {
    const node: CacheNode = {
      type: "Cache",
      name: "AppCache",
      loc: DUMMY_LOC,
      provider: "memory",
      ttl: 300,
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("provider: memory");
    expect(dsl).toContain("ttl: 300");
    parseWith(dsl);
  });

  it("cache block — redis with url", () => {
    const node: CacheNode = {
      type: "Cache",
      name: "RedisCache",
      loc: DUMMY_LOC,
      provider: "redis",
      redis: { url: "REDIS_URL" },
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("redis: {");
    expect(dsl).toContain("url: env(REDIS_URL)");
    parseWith(dsl);
  });

  it("inbound webhook block", () => {
    const node: WebhookNode = {
      type: "Webhook",
      name: "StripeWebhook",
      loc: DUMMY_LOC,
      mode: "inbound",
      path: "/webhooks/stripe",
      fn: {
        kind: "named",
        namedExport: "handleStripeWebhook",
        source: "@src/webhooks/stripe.ts",
      },
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain('path: "/webhooks/stripe"');
    expect(dsl).toContain("fn: import");
    // round-trip
    parseWith(dsl);
  });

  it("outbound webhook block", () => {
    const entity: EntityNode = {
      type: "Entity",
      name: "Post",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
      ],
    };
    const node: WebhookNode = {
      type: "Webhook",
      name: "PostEvents",
      loc: DUMMY_LOC,
      mode: "outbound",
      entity: "Post",
      events: ["created", "updated", "deleted"],
      targets: "WEBHOOK_URLS",
    };
    const dsl = s.serializeMany([entity, node]);
    expect(dsl).toContain("entity: Post");
    expect(dsl).toContain("targets: env(WEBHOOK_URLS)");
    parseWith(dsl);
  });

  it("observability block", () => {
    const node: ObservabilityNode = {
      type: "Observability",
      loc: DUMMY_LOC,
      tracing: true,
      metrics: false,
      logs: "structured",
      exporter: "otlp",
      errorTracking: "sentry",
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("tracing: true");
    expect(dsl).toContain("logs: structured");
    expect(dsl).toContain("exporter: otlp");
    expect(dsl).toContain("errorTracking: sentry");
    parseWith(dsl);
  });

  it("autoPage block — list type", () => {
    const entity: EntityNode = {
      type: "Entity",
      name: "Todo",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
      ],
    };
    const node: AutoPageNode = {
      type: "AutoPage",
      name: "TodoList",
      loc: DUMMY_LOC,
      entity: "Todo",
      path: "/todos",
      pageType: "list",
      paginate: true,
    };
    const dsl = s.serializeMany([entity, node]);
    expect(dsl).toContain("autoPage TodoList {");
    expect(dsl).toContain("type: list");
    expect(dsl).toContain("paginate: true");
    parseWith(dsl);
  });

  it("seed block", () => {
    const node: SeedNode = {
      type: "Seed",
      loc: DUMMY_LOC,
      fn: { kind: "named", namedExport: "seed", source: "@src/seed.ts" },
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("seed {");
    expect(dsl).toContain('import { seed } from "@src/seed.ts"');
    parseWith(dsl);
  });

  it("middleware block", () => {
    const node: MiddlewareNode = {
      type: "Middleware",
      name: "requestLogger",
      loc: DUMMY_LOC,
      fn: {
        kind: "default",
        defaultExport: "requestLogger",
        source: "@src/middleware/logger.ts",
      },
      scope: "global",
    };
    const dsl = s.serialize(node);
    expect(dsl).toContain("middleware requestLogger {");
    expect(dsl).toContain("scope: global");
    parseWith(dsl);
  });

  it("admin block", () => {
    const entity: EntityNode = {
      type: "Entity",
      name: "Post",
      loc: DUMMY_LOC,
      fields: [
        {
          name: "id",
          type: "Int",
          modifiers: ["id"],
          isRelation: false,
          isArray: false,
          nullable: false,
          isUpdatedAt: false,
        },
      ],
    };
    const node: AdminNode = {
      type: "Admin",
      loc: DUMMY_LOC,
      entities: ["Post"],
    };
    const dsl = s.serializeMany([entity, node]);
    expect(dsl).toContain("admin {");
    expect(dsl).toContain("entities: [Post]");
    parseWith(dsl);
  });
});

describe("AstSerializer.serializeMany", () => {
  it("joins multiple nodes with a blank line between them", () => {
    const r: RouteNode = {
      type: "Route",
      name: "HomeRoute",
      loc: DUMMY_LOC,
      path: "/",
      to: "HomePage",
      params: [],
    };
    const p: PageNode = {
      type: "Page",
      name: "HomePage",
      loc: DUMMY_LOC,
      component: {
        kind: "default",
        defaultExport: "Home",
        source: "@src/pages/Home.vue",
      },
    };
    const dsl = s.serializeMany([r, p]);
    expect(dsl).toContain("route HomeRoute {");
    expect(dsl).toContain("page HomePage {");
    // blank line separator
    expect(dsl).toMatch(/\}\n\npage/);
  });
});
