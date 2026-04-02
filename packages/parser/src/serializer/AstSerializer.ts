/**
 * AstSerializer — converts any VaspNode back into formatted .vasp DSL text.
 *
 * The serialised output is guaranteed to round-trip through the parser
 * (i.e. `parse(serialize(node))` succeeds) as long as referenced entities,
 * pages, etc. already exist in the target file.
 *
 * Usage:
 *   const s = new AstSerializer();
 *   const dsl = s.serialize(node);      // single node
 *   const dsl = s.serializeMany(nodes); // multiple nodes, one blank line between each
 */

import type {
  ActionNode,
  AdminNode,
  ApiNode,
  AppNode,
  AuthNode,
  AutoPageNode,
  CacheNode,
  CrudNode,
  EmailNode,
  EntityNode,
  FieldNode,
  ImportExpression,
  JobNode,
  MiddlewareNode,
  ObservabilityNode,
  PageNode,
  QueryNode,
  RealtimeNode,
  RouteNode,
  SeedNode,
  StorageNode,
  VaspNode,
  WebhookNode,
} from "@vasp-framework/core";

const I = "  "; // 1-level indent (2 spaces)
const II = "    "; // 2-level indent (4 spaces)

/** Format an ImportExpression into DSL import syntax (default or named). */
function imp(expr: ImportExpression): string {
  return expr.kind === "default"
    ? `import ${expr.defaultExport} from "${expr.source}"`
    : `import { ${expr.namedExport} } from "${expr.source}"`;
}

/** Format a string array into DSL list syntax, e.g. `["a","b"]` → `[a, b]`. */
function lst(items: string[]): string {
  return `[${items.join(", ")}]`;
}

export class AstSerializer {
  /** Serialise a single VaspNode to DSL text. */
  serialize(node: VaspNode): string {
    switch (node.type) {
      case "App":
        return this.app(node);
      case "Entity":
        return this.entity(node);
      case "Route":
        return this.route(node);
      case "Page":
        return this.page(node);
      case "Query":
        return this.query(node);
      case "Action":
        return this.action(node);
      case "Crud":
        return this.crud(node);
      case "Realtime":
        return this.realtime(node);
      case "Job":
        return this.job(node);
      case "Auth":
        return this.auth(node);
      case "Api":
        return this.api(node);
      case "Storage":
        return this.storage(node);
      case "Email":
        return this.email(node);
      case "Cache":
        return this.cache(node);
      case "Webhook":
        return this.webhook(node);
      case "Observability":
        return this.observability(node);
      case "AutoPage":
        return this.autoPage(node);
      case "Seed":
        return this.seed(node);
      case "Middleware":
        return this.middleware(node);
      case "Admin":
        return this.admin(node);
    }
  }

  /** Serialise multiple nodes separated by a blank line. */
  serializeMany(nodes: VaspNode[]): string {
    return nodes.map((n) => this.serialize(n)).join("\n\n");
  }

  // ── Private per-node serialisers ──────────────────────────────────────────

  private field(f: FieldNode): string {
    let typePart = f.type;
    if (f.enumValues?.length) {
      typePart = `Enum(${f.enumValues.join(", ")})`;
    }
    if (f.isArray) typePart += "[]";

    const mods: string[] = [];
    for (const mod of f.modifiers) {
      if (mod === "id") mods.push("@id");
      else if (mod === "unique") mods.push("@unique");
      else if (mod === "default_now") mods.push("@default(now)");
      else if (mod === "nullable") mods.push("@nullable");
      else if (mod === "updatedAt") mods.push("@updatedAt");
      else if (mod === "hidden") mods.push("@hidden");
    }
    // Non-"now" default value (e.g. @default("active"))
    if (f.defaultValue && f.defaultValue !== "now") {
      const v = isNaN(Number(f.defaultValue))
        ? `"${f.defaultValue}"`
        : f.defaultValue;
      mods.push(`@default(${v})`);
    }
    if (f.onDelete) {
      const d = f.onDelete === "set null" ? "setNull" : f.onDelete;
      mods.push(`@onDelete(${d})`);
    }
    if (f.isManyToMany) mods.push("@manyToMany");
    if (f.storageBlock) mods.push(`@storage(${f.storageBlock})`);
    if (f.validation) {
      const parts: string[] = [];
      if (f.validation.email) parts.push("email");
      if (f.validation.url) parts.push("url");
      if (f.validation.uuid) parts.push("uuid");
      if (f.validation.minLength !== undefined)
        parts.push(`minLength: ${f.validation.minLength}`);
      if (f.validation.maxLength !== undefined)
        parts.push(`maxLength: ${f.validation.maxLength}`);
      if (f.validation.min !== undefined) parts.push(`min: ${f.validation.min}`);
      if (f.validation.max !== undefined) parts.push(`max: ${f.validation.max}`);
      mods.push(`@validate(${parts.join(", ")})`);
    }

    const suffix = mods.length ? " " + mods.join(" ") : "";
    return `${f.name}: ${typePart}${suffix}`;
  }

  private entity(node: EntityNode): string {
    const lines: string[] = node.fields.map((f) => `${I}${this.field(f)}`);
    for (const idx of node.indexes ?? []) {
      const typeStr = idx.type ? `, type: ${idx.type}` : "";
      lines.push(`${I}@@index([${idx.fields.join(", ")}]${typeStr})`);
    }
    for (const uc of node.uniqueConstraints ?? []) {
      lines.push(`${I}@@unique([${uc.fields.join(", ")}])`);
    }
    return `entity ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private route(node: RouteNode): string {
    const lines = [`${I}path: "${node.path}"`, `${I}to: ${node.to}`];
    if (node.protected !== undefined)
      lines.push(`${I}protected: ${node.protected}`);
    return `route ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private page(node: PageNode): string {
    return `page ${node.name} {\n${I}component: ${imp(node.component)}\n}`;
  }

  private query(node: QueryNode): string {
    const lines = [
      `${I}fn: ${imp(node.fn)}`,
      `${I}entities: ${lst(node.entities)}`,
    ];
    if (node.auth) lines.push(`${I}auth: true`);
    return `query ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private action(node: ActionNode): string {
    const lines = [
      `${I}fn: ${imp(node.fn)}`,
      `${I}entities: ${lst(node.entities)}`,
    ];
    if (node.auth) lines.push(`${I}auth: true`);
    return `action ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private crud(node: CrudNode): string {
    return [
      `crud ${node.name} {`,
      `${I}entity: ${node.entity}`,
      `${I}operations: ${lst(node.operations)}`,
      `}`,
    ].join("\n");
  }

  private realtime(node: RealtimeNode): string {
    return [
      `realtime ${node.name} {`,
      `${I}entity: ${node.entity}`,
      `${I}events: ${lst(node.events)}`,
      `}`,
    ].join("\n");
  }

  private job(node: JobNode): string {
    const lines: string[] = [`${I}executor: ${node.executor}`];
    if (node.priority !== undefined) lines.push(`${I}priority: ${node.priority}`);
    if (node.retries) {
      lines.push(`${I}retries: {`);
      if (node.retries.limit !== undefined)
        lines.push(`${II}limit: ${node.retries.limit}`);
      if (node.retries.backoff)
        lines.push(`${II}backoff: ${node.retries.backoff}`);
      if (node.retries.delay !== undefined)
        lines.push(`${II}delay: ${node.retries.delay}`);
      if (node.retries.multiplier !== undefined)
        lines.push(`${II}multiplier: ${node.retries.multiplier}`);
      lines.push(`${I}}`);
    }
    if (node.deadLetter) {
      lines.push(`${I}deadLetter: {`);
      if (node.deadLetter.queue)
        lines.push(`${II}queue: "${node.deadLetter.queue}"`);
      lines.push(`${I}}`);
    }
    lines.push(`${I}perform: {`);
    lines.push(`${II}fn: ${imp(node.perform.fn)}`);
    lines.push(`${I}}`);
    if (node.schedule) lines.push(`${I}schedule: "${node.schedule}"`);
    return `job ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private auth(node: AuthNode): string {
    const lines = [
      `${I}userEntity: ${node.userEntity}`,
      `${I}methods: ${lst(node.methods)}`,
    ];
    if (node.roles?.length) lines.push(`${I}roles: ${lst(node.roles)}`);
    return `auth ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private api(node: ApiNode): string {
    const lines = [
      `${I}method: ${node.method}`,
      `${I}path: "${node.path}"`,
      `${I}fn: ${imp(node.fn)}`,
    ];
    if (node.auth) lines.push(`${I}auth: true`);
    return `api ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private storage(node: StorageNode): string {
    const lines = [`${I}provider: ${node.provider}`];
    if (node.bucket) lines.push(`${I}bucket: "${node.bucket}"`);
    if (node.maxSize) lines.push(`${I}maxSize: "${node.maxSize}"`);
    if (node.allowedTypes?.length) {
      lines.push(
        `${I}allowedTypes: [${node.allowedTypes.map((t) => `"${t}"`).join(", ")}]`,
      );
    }
    if (node.publicPath) lines.push(`${I}publicPath: "${node.publicPath}"`);
    return `storage ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private email(node: EmailNode): string {
    const lines = [
      `${I}provider: ${node.provider}`,
      `${I}from: "${node.from}"`,
    ];
    lines.push(`${I}templates: {`);
    for (const tpl of node.templates) {
      lines.push(`${II}${tpl.name}: ${imp(tpl.fn)}`);
    }
    lines.push(`${I}}`);
    return `email ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private cache(node: CacheNode): string {
    const lines = [`${I}provider: ${node.provider}`];
    if (node.ttl !== undefined) lines.push(`${I}ttl: ${node.ttl}`);
    if (node.redis?.url) {
      lines.push(`${I}redis: {`);
      lines.push(`${II}url: env(${node.redis.url})`);
      lines.push(`${I}}`);
    }
    return `cache ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private webhook(node: WebhookNode): string {
    const lines: string[] = [];
    if (node.secret) lines.push(`${I}secret: env(${node.secret})`);
    if (node.mode === "inbound") {
      if (node.path) lines.push(`${I}path: "${node.path}"`);
      if (node.verifyWith)
        lines.push(`${I}verifyWith: "${node.verifyWith}"`);
      if (node.fn) lines.push(`${I}fn: ${imp(node.fn)}`);
    } else {
      if (node.entity) lines.push(`${I}entity: ${node.entity}`);
      if (node.events?.length) lines.push(`${I}events: ${lst(node.events)}`);
      if (node.targets) lines.push(`${I}targets: env(${node.targets})`);
      if (node.retry !== undefined) lines.push(`${I}retry: ${node.retry}`);
    }
    return `webhook ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private observability(node: ObservabilityNode): string {
    return [
      `observability {`,
      `${I}tracing: ${node.tracing}`,
      `${I}metrics: ${node.metrics}`,
      `${I}logs: ${node.logs}`,
      `${I}exporter: ${node.exporter}`,
      `${I}errorTracking: ${node.errorTracking}`,
      `}`,
    ].join("\n");
  }

  private autoPage(node: AutoPageNode): string {
    const lines = [
      `${I}entity: ${node.entity}`,
      `${I}path: "${node.path}"`,
      `${I}type: ${node.pageType}`,
    ];
    if (node.title) lines.push(`${I}title: "${node.title}"`);
    if (node.columns?.length)
      lines.push(`${I}columns: ${lst(node.columns)}`);
    if (node.sortable?.length)
      lines.push(`${I}sortable: ${lst(node.sortable)}`);
    if (node.filterable?.length)
      lines.push(`${I}filterable: ${lst(node.filterable)}`);
    if (node.searchable?.length)
      lines.push(`${I}searchable: ${lst(node.searchable)}`);
    if (node.paginate !== undefined)
      lines.push(`${I}paginate: ${node.paginate}`);
    if (node.pageSize !== undefined)
      lines.push(`${I}pageSize: ${node.pageSize}`);
    if (node.rowActions?.length)
      lines.push(`${I}rowActions: ${lst(node.rowActions)}`);
    if (node.topActions?.length)
      lines.push(`${I}topActions: ${lst(node.topActions)}`);
    if (node.fields?.length) lines.push(`${I}fields: ${lst(node.fields)}`);
    if (node.layout) lines.push(`${I}layout: "${node.layout}"`);
    if (node.submitAction)
      lines.push(`${I}submitAction: ${node.submitAction}`);
    if (node.successRoute)
      lines.push(`${I}successRoute: "${node.successRoute}"`);
    if (node.auth !== undefined) lines.push(`${I}auth: ${node.auth}`);
    if (node.roles?.length) lines.push(`${I}roles: ${lst(node.roles)}`);
    return `autoPage ${node.name} {\n${lines.join("\n")}\n}`;
  }

  private seed(node: SeedNode): string {
    return `seed {\n${I}fn: ${imp(node.fn)}\n}`;
  }

  private middleware(node: MiddlewareNode): string {
    return [
      `middleware ${node.name} {`,
      `${I}fn: ${imp(node.fn)}`,
      `${I}scope: ${node.scope}`,
      `}`,
    ].join("\n");
  }

  private admin(node: AdminNode): string {
    return `admin {\n${I}entities: ${lst(node.entities)}\n}`;
  }

  private app(node: AppNode): string {
    return [
      `app ${node.name} {`,
      `${I}title: "${node.title}"`,
      `${I}db: ${node.db}`,
      `${I}ssr: ${node.ssr}`,
      `${I}typescript: ${node.typescript}`,
      `}`,
    ].join("\n");
  }
}
