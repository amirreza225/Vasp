import { ensureDir } from "../utils/fs.js";
import { join } from "node:path";
import { BaseGenerator } from "./BaseGenerator.js";
import { VASP_VERSION } from "@vasp-framework/core";
import {
  DEFAULT_BACKEND_PORT,
  DEFAULT_SPA_PORT,
  DEFAULT_SSR_PORT,
} from "@vasp-framework/core";

export class ScaffoldGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info("Scaffolding project structure...");

    // Create directory skeleton
    const dirs = [
      "src/pages",
      "src/components",
      "src/lib",
      "shared",
      "drizzle",
      "drizzle/migrations",
      "server/routes/queries",
      "server/routes/actions",
      "server/middleware",
      "server/db",
      "tests",
      "tests/crud",
      "tests/auth",
      "tests/queries",
      "tests/actions",
      ...(this.ctx.isSpa
        ? ["src/vasp/client"]
        : ["composables", "plugins", "pages", "middleware"]),
    ];
    for (const dir of dirs) {
      ensureDir(join(this.ctx.outputDir, dir));
    }

    const frontendPort = this.ctx.isSpa ? DEFAULT_SPA_PORT : DEFAULT_SSR_PORT;

    // package.json
    const pkgContent = this.render("shared/package.json.hbs", {
      vaspVersion: VASP_VERSION,
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort,
      authMethods: this.ctx.ast.auth?.methods ?? [],
    });
    this.write("package.json", pkgContent);

    // bunfig.toml
    this.write("bunfig.toml", this.render("shared/bunfig.toml.hbs"));

    // .gitignore
    this.write(".gitignore", this.render("shared/.gitignore.hbs"));

    // .env.example
    const envData = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort,
      authMethods: this.ctx.ast.auth?.methods ?? [],
    };
    this.write(".env.example", this.render("shared/.env.example.hbs", envData));

    // .env (working copy so the app starts immediately)
    this.write(".env", this.render("shared/.env.hbs", envData));

    // README.md
    this.write(
      "README.md",
      this.render("shared/README.md.hbs", {
        backendPort: DEFAULT_BACKEND_PORT,
      }),
    );

    // tsconfig.json — only when typescript: true
    if (this.ctx.isTypeScript) {
      this.write("tsconfig.json", this.render("shared/tsconfig.json.hbs"));
    }

    // shared/types — entity interfaces + query/action type stubs (TS only)
    if (this.ctx.isTypeScript && this.ctx.ast.entities.length > 0) {
      this.write(
        "shared/types.ts",
        this.render("shared/shared/types.hbs", {
          entities: this.ctx.ast.entities,
        }),
      );
    }

    // shared/validation — Valibot schemas derived from entities
    if (this.ctx.ast.entities.length > 0) {
      this.write(
        `shared/validation.${this.ctx.ext}`,
        this.render("shared/shared/validation.hbs", {
          entities: this.ctx.ast.entities,
        }),
      );
    }

    // Test scaffold
    this.write(
      `vitest.config.${this.ctx.ext}`,
      this.render(`shared/tests/vitest.config.${this.ctx.ext}.hbs`),
    );
    this.write(
      `tests/setup.${this.ctx.ext}`,
      this.render(`shared/tests/setup.${this.ctx.ext}.hbs`),
    );

    for (const crud of this.ctx.ast.cruds) {
      this.write(
        `tests/crud/${crud.entity.toLowerCase()}.test.${this.ctx.ext}`,
        this.render(`shared/tests/crud/_entity.test.${this.ctx.ext}.hbs`, {
          entity: crud.entity,
        }),
      );
    }

    for (const query of this.ctx.ast.queries) {
      this.write(
        `tests/queries/${query.name}.test.${this.ctx.ext}`,
        this.render(`shared/tests/queries/_query.test.${this.ctx.ext}.hbs`, {
          name: query.name,
        }),
      );
    }

    for (const action of this.ctx.ast.actions) {
      this.write(
        `tests/actions/${action.name}.test.${this.ctx.ext}`,
        this.render(`shared/tests/actions/_action.test.${this.ctx.ext}.hbs`, {
          name: action.name,
        }),
      );
    }

    if (this.ctx.ast.auth) {
      this.write(
        `tests/auth/login.test.${this.ctx.ext}`,
        this.render(`shared/tests/auth/login.test.${this.ctx.ext}.hbs`),
      );
    }

    // main.vasp (copy the source)
    this.write("main.vasp", this.generateMainVasp());
  }

  private generateMainVasp(): string {
    // The user's main.vasp is placed at the project root as-is during `vasp new`
    // During scaffold, we generate a clean version based on the parsed AST
    const { ast } = this.ctx;

    const lines: string[] = [
      `app ${ast.app!.name} {`,
      `  title: "${ast.app!.title}"`,
      `  db: ${ast.app!.db}`,
      `  ssr: ${typeof ast.app!.ssr === "string" ? `"${ast.app!.ssr}"` : ast.app!.ssr}`,
      `  typescript: ${ast.app!.typescript}`,
    ];

    // app.env sub-block
    if (ast.app!.env && Object.keys(ast.app!.env).length > 0) {
      lines.push(`  env: {`);
      for (const [key, def] of Object.entries(ast.app!.env)) {
        let line = `    ${key}: ${def.requirement} ${def.type}`;
        if (def.type === "Enum" && def.enumValues) {
          line += `(${def.enumValues.join(", ")})`;
        }
        if (def.defaultValue !== undefined) {
          const needsQuotes = def.type === "String" || def.type === "Enum";
          line += needsQuotes
            ? ` @default("${def.defaultValue}")`
            : ` @default(${def.defaultValue})`;
        }
        if (def.validation) {
          const v = def.validation;
          if (v.minLength !== undefined) line += ` @minLength(${v.minLength})`;
          if (v.maxLength !== undefined) line += ` @maxLength(${v.maxLength})`;
          if (v.startsWith !== undefined)
            line += ` @startsWith("${v.startsWith}")`;
          if (v.endsWith !== undefined) line += ` @endsWith("${v.endsWith}")`;
          if (v.min !== undefined) line += ` @min(${v.min})`;
          if (v.max !== undefined) line += ` @max(${v.max})`;
        }
        lines.push(line);
      }
      lines.push(`  }`);
    }

    // app.multiTenant sub-block
    if (ast.app!.multiTenant) {
      const mt = ast.app!.multiTenant;
      lines.push(
        `  multiTenant: {`,
        `    strategy: "${mt.strategy}"`,
        `    tenantEntity: ${mt.tenantEntity}`,
        `    tenantField: ${mt.tenantField}`,
        `  }`,
      );
    }

    // app.ui sub-block
    if (ast.app!.ui) {
      const ui = ast.app!.ui;
      lines.push(`  ui: {`, `    theme: ${ui.theme}`);
      if (ui.primaryColor) lines.push(`    primaryColor: ${ui.primaryColor}`);
      lines.push(
        `    darkModeSelector: "${ui.darkModeSelector}"`,
        `    ripple: ${ui.ripple}`,
        `  }`,
      );
    }

    lines.push(`}`, "");

    // auth block
    if (ast.auth) {
      lines.push(
        `auth ${ast.auth.name} {`,
        `  userEntity: ${ast.auth.userEntity}`,
        `  methods: [ ${ast.auth.methods.join(", ")} ]`,
      );
      if (ast.auth.roles && ast.auth.roles.length > 0) {
        lines.push(`  roles: [ ${ast.auth.roles.join(", ")} ]`);
      }
      if (
        ast.auth.permissions &&
        Object.keys(ast.auth.permissions).length > 0
      ) {
        lines.push(`  permissions: {`);
        for (const [perm, roles] of Object.entries(ast.auth.permissions)) {
          lines.push(`    ${perm}: [ ${roles.join(", ")} ]`);
        }
        lines.push(`  }`);
      }
      lines.push(`}`, "");
    }

    // route blocks
    for (const route of ast.routes) {
      lines.push(
        `route ${route.name} {`,
        `  path: "${route.path}"`,
        `  to: ${route.to}`,
        `}`,
        "",
      );
    }

    // page blocks
    for (const page of ast.pages) {
      const comp = page.component;
      const importStr =
        comp.kind === "default"
          ? `import ${comp.defaultExport} from "${comp.source}"`
          : `import { ${comp.namedExport} } from "${comp.source}"`;
      lines.push(`page ${page.name} {`, `  component: ${importStr}`, `}`, "");
    }

    // entity blocks
    for (const entity of ast.entities) {
      lines.push(`entity ${entity.name} {`);
      for (const field of entity.fields) {
        // Reconstruct the type string with enum variants and array notation
        let typeStr = field.type;
        if (field.enumValues && field.enumValues.length > 0) {
          typeStr = `Enum(${field.enumValues.join(", ")})`;
        }
        if (field.isArray) {
          typeStr += "[]";
        }

        // Reconstruct modifiers in canonical order
        const modParts: string[] = [];
        if (field.modifiers.includes("id")) modParts.push("@id");
        if (field.modifiers.includes("unique")) modParts.push("@unique");
        if (field.defaultValue !== undefined) {
          if (field.defaultValue === "now") {
            modParts.push("@default(now)");
          } else if (
            !isNaN(Number(field.defaultValue)) ||
            field.defaultValue === "true" ||
            field.defaultValue === "false"
          ) {
            modParts.push(`@default(${field.defaultValue})`);
          } else {
            modParts.push(`@default("${field.defaultValue}")`);
          }
        }
        if (field.onDelete) {
          // AST stores 'set null' (with space); DSL keyword is 'setNull'
          const onDeleteStr =
            field.onDelete === "set null" ? "setNull" : field.onDelete;
          modParts.push(`@onDelete(${onDeleteStr})`);
        }
        if (field.nullable) modParts.push("@nullable");
        if (field.isUpdatedAt) modParts.push("@updatedAt");
        if (field.isManyToMany) modParts.push("@manyToMany");
        if (field.storageBlock)
          modParts.push(`@storage(${field.storageBlock})`);
        if (field.validation) {
          const vld = field.validation;
          const parts: string[] = [];
          if (vld.email) parts.push("email");
          else if (vld.url) parts.push("url");
          else if (vld.uuid) parts.push("uuid");
          if (vld.minLength != null) parts.push(`minLength: ${vld.minLength}`);
          if (vld.maxLength != null) parts.push(`maxLength: ${vld.maxLength}`);
          if (vld.min != null) parts.push(`min: ${vld.min}`);
          if (vld.max != null) parts.push(`max: ${vld.max}`);
          if (parts.length > 0) modParts.push(`@validate(${parts.join(", ")})`);
        }

        const mods = modParts.join(" ");
        lines.push(`  ${field.name}: ${typeStr}${mods ? " " + mods : ""}`);
      }
      // Table-level indexes
      for (const idx of entity.indexes ?? []) {
        const fieldList = idx.fields.join(", ");
        if (idx.type) {
          lines.push(`  @@index([${fieldList}], type: ${idx.type})`);
        } else {
          lines.push(`  @@index([${fieldList}])`);
        }
      }
      // Table-level unique constraints
      for (const uc of entity.uniqueConstraints ?? []) {
        lines.push(`  @@unique([${uc.fields.join(", ")}])`);
      }
      lines.push(`}`, "");
    }

    // query blocks
    for (const query of ast.queries) {
      const fn = query.fn;
      const fnStr =
        fn.kind === "named"
          ? `import { ${fn.namedExport} } from "${fn.source}"`
          : `import ${fn.defaultExport} from "${fn.source}"`;
      lines.push(
        `query ${query.name} {`,
        `  fn: ${fnStr}`,
        `  entities: [${query.entities.join(", ")}]`,
      );
      if (query.auth) lines.push(`  auth: true`);
      if (query.roles && query.roles.length > 0) {
        lines.push(`  roles: [${query.roles.join(", ")}]`);
      }
      if (query.cache) {
        const c = query.cache;
        lines.push(`  cache: {`, `    store: ${c.store}`);
        if (c.ttl !== undefined) lines.push(`    ttl: ${c.ttl}`);
        if (c.key !== undefined) lines.push(`    key: "${c.key}"`);
        if (c.invalidateOn && c.invalidateOn.length > 0) {
          lines.push(`    invalidateOn: [${c.invalidateOn.join(", ")}]`);
        }
        lines.push(`  }`);
      }
      lines.push(`}`, "");
    }

    // action blocks
    for (const action of ast.actions) {
      const fn = action.fn;
      const fnStr =
        fn.kind === "named"
          ? `import { ${fn.namedExport} } from "${fn.source}"`
          : `import ${fn.defaultExport} from "${fn.source}"`;
      lines.push(
        `action ${action.name} {`,
        `  fn: ${fnStr}`,
        `  entities: [${action.entities.join(", ")}]`,
      );
      if (action.auth) lines.push(`  auth: true`);
      if (action.roles && action.roles.length > 0) {
        lines.push(`  roles: [${action.roles.join(", ")}]`);
      }
      if (action.onSuccess?.sendEmail) {
        lines.push(
          `  onSuccess: {`,
          `    sendEmail: ${action.onSuccess.sendEmail}`,
          `  }`,
        );
      }
      lines.push(`}`, "");
    }

    // middleware blocks
    for (const middleware of ast.middlewares) {
      const fn = middleware.fn;
      const fnStr =
        fn.kind === "named"
          ? `import { ${fn.namedExport} } from "${fn.source}"`
          : `import ${fn.defaultExport} from "${fn.source}"`;
      lines.push(
        `middleware ${middleware.name} {`,
        `  fn: ${fnStr}`,
        `  scope: ${middleware.scope}`,
        `}`,
        "",
      );
    }

    // api blocks
    for (const api of ast.apis) {
      const fn = api.fn;
      const fnStr =
        fn.kind === "named"
          ? `import { ${fn.namedExport} } from "${fn.source}"`
          : `import ${fn.defaultExport} from "${fn.source}"`;
      lines.push(
        `api ${api.name} {`,
        `  method: ${api.method}`,
        `  path: "${api.path}"`,
        `  fn: ${fnStr}`,
      );
      if (api.auth) lines.push(`  auth: true`);
      if (api.roles && api.roles.length > 0) {
        lines.push(`  roles: [${api.roles.join(", ")}]`);
      }
      lines.push(`}`, "");
    }

    // crud blocks
    for (const crud of ast.cruds) {
      lines.push(
        `crud ${crud.name} {`,
        `  entity: ${crud.entity}`,
        `  operations: [${crud.operations.join(", ")}]`,
      );
      if (crud.ownership) lines.push(`  ownership: ${crud.ownership}`);
      if (crud.listConfig) {
        const lc = crud.listConfig;
        lines.push(`  list: {`, `    paginate: ${lc.paginate}`);
        if (lc.sortable.length > 0)
          lines.push(`    sortable: [${lc.sortable.join(", ")}]`);
        if (lc.filterable.length > 0)
          lines.push(`    filterable: [${lc.filterable.join(", ")}]`);
        if (lc.search.length > 0)
          lines.push(`    search: [${lc.search.join(", ")}]`);
        lines.push(`  }`);
      }
      if (crud.permissions && Object.keys(crud.permissions).length > 0) {
        lines.push(`  permissions: {`);
        for (const [op, perm] of Object.entries(crud.permissions)) {
          lines.push(`    ${op}: ${perm}`);
        }
        lines.push(`  }`);
      }
      lines.push(`}`, "");
    }

    // realtime blocks
    for (const realtime of ast.realtimes) {
      lines.push(
        `realtime ${realtime.name} {`,
        `  entity: ${realtime.entity}`,
        `  events: [${realtime.events.join(", ")}]`,
        `}`,
        "",
      );
    }

    // job blocks
    for (const job of ast.jobs) {
      const performFn = job.perform.fn;
      const performFnStr =
        performFn.kind === "named"
          ? `import { ${performFn.namedExport} } from "${performFn.source}"`
          : `import ${performFn.defaultExport} from "${performFn.source}"`;
      lines.push(`job ${job.name} {`, `  executor: ${job.executor}`);
      if (job.priority !== undefined) lines.push(`  priority: ${job.priority}`);
      if (job.retries) {
        const r = job.retries;
        lines.push(`  retries: {`);
        if (r.limit !== undefined) lines.push(`    limit: ${r.limit}`);
        if (r.backoff !== undefined) lines.push(`    backoff: ${r.backoff}`);
        if (r.delay !== undefined) lines.push(`    delay: ${r.delay}`);
        if (r.multiplier !== undefined)
          lines.push(`    multiplier: ${r.multiplier}`);
        lines.push(`  }`);
      }
      if (job.deadLetter?.queue) {
        lines.push(
          `  deadLetter: {`,
          `    queue: "${job.deadLetter.queue}"`,
          `  }`,
        );
      }
      lines.push(`  perform: {`, `    fn: ${performFnStr}`, `  }`);
      if (job.schedule) lines.push(`  schedule: "${job.schedule}"`);
      lines.push(`}`, "");
    }

    // seed block
    if (ast.seed) {
      const seedFn = ast.seed.fn;
      const seedFnStr =
        seedFn.kind === "named"
          ? `import { ${seedFn.namedExport} } from "${seedFn.source}"`
          : `import ${seedFn.defaultExport} from "${seedFn.source}"`;
      lines.push(`seed {`, `  fn: ${seedFnStr}`, `}`, "");
    }

    // admin block
    if (ast.admin && ast.admin.entities.length > 0) {
      lines.push(
        `admin {`,
        `  entities: [${ast.admin.entities.join(", ")}]`,
        `}`,
        "",
      );
    }

    // storage blocks
    for (const storage of ast.storages) {
      lines.push(
        `storage ${storage.name} {`,
        `  provider: ${storage.provider}`,
      );
      if (storage.bucket) lines.push(`  bucket: "${storage.bucket}"`);
      if (storage.maxSize) lines.push(`  maxSize: "${storage.maxSize}"`);
      if (storage.allowedTypes && storage.allowedTypes.length > 0) {
        const types = storage.allowedTypes.map((t) => `"${t}"`).join(", ");
        lines.push(`  allowedTypes: [${types}]`);
      }
      if (storage.publicPath)
        lines.push(`  publicPath: "${storage.publicPath}"`);
      lines.push(`}`, "");
    }

    // email blocks
    for (const email of ast.emails) {
      lines.push(
        `email ${email.name} {`,
        `  provider: ${email.provider}`,
        `  from: "${email.from}"`,
      );
      if (email.templates.length > 0) {
        lines.push(`  templates: {`);
        for (const tpl of email.templates) {
          const fnStr =
            tpl.fn.kind === "named"
              ? `import { ${tpl.fn.namedExport} } from "${tpl.fn.source}"`
              : `import ${tpl.fn.defaultExport} from "${tpl.fn.source}"`;
          lines.push(`    ${tpl.name}: ${fnStr}`);
        }
        lines.push(`  }`);
      }
      lines.push(`}`, "");
    }

    // cache blocks
    for (const cache of ast.caches) {
      lines.push(`cache ${cache.name} {`, `  provider: ${cache.provider}`);
      if (cache.ttl !== undefined) lines.push(`  ttl: ${cache.ttl}`);
      if (cache.redis) {
        lines.push(`  redis: {`, `    url: env(${cache.redis.url})`, `  }`);
      }
      lines.push(`}`, "");
    }

    // webhook blocks
    for (const webhook of ast.webhooks) {
      lines.push(`webhook ${webhook.name} {`);
      if (webhook.mode === "inbound") {
        if (webhook.path) lines.push(`  path: "${webhook.path}"`);
        if (webhook.secret) lines.push(`  secret: env(${webhook.secret})`);
        if (webhook.verifyWith)
          lines.push(`  verifyWith: "${webhook.verifyWith}"`);
        if (webhook.fn) {
          const fnStr =
            webhook.fn.kind === "named"
              ? `import { ${webhook.fn.namedExport} } from "${webhook.fn.source}"`
              : `import ${webhook.fn.defaultExport} from "${webhook.fn.source}"`;
          lines.push(`  fn: ${fnStr}`);
        }
      } else {
        // outbound
        if (webhook.entity) lines.push(`  entity: ${webhook.entity}`);
        if (webhook.events && webhook.events.length > 0) {
          lines.push(`  events: [${webhook.events.join(", ")}]`);
        }
        if (webhook.targets) lines.push(`  targets: env(${webhook.targets})`);
        if (webhook.retry !== undefined)
          lines.push(`  retry: ${webhook.retry}`);
        if (webhook.secret) lines.push(`  secret: env(${webhook.secret})`);
      }
      lines.push(`}`, "");
    }

    // observability block
    if (ast.observability) {
      const obs = ast.observability;
      lines.push(
        `observability {`,
        `  tracing: ${obs.tracing}`,
        `  metrics: ${obs.metrics}`,
        `  logs: ${obs.logs}`,
        `  exporter: ${obs.exporter}`,
        `  errorTracking: ${obs.errorTracking}`,
        `}`,
        "",
      );
    }

    // autoPage blocks
    for (const ap of ast.autoPages) {
      lines.push(
        `autoPage ${ap.name} {`,
        `  entity: ${ap.entity}`,
        `  path: "${ap.path}"`,
        `  type: ${ap.pageType}`,
      );
      if (ap.title) lines.push(`  title: "${ap.title}"`);
      if (ap.columns && ap.columns.length > 0) {
        lines.push(`  columns: [${ap.columns.join(", ")}]`);
      }
      if (ap.sortable && ap.sortable.length > 0) {
        lines.push(`  sortable: [${ap.sortable.join(", ")}]`);
      }
      if (ap.filterable && ap.filterable.length > 0) {
        lines.push(`  filterable: [${ap.filterable.join(", ")}]`);
      }
      if (ap.searchable && ap.searchable.length > 0) {
        lines.push(`  searchable: [${ap.searchable.join(", ")}]`);
      }
      if (ap.rowActions && ap.rowActions.length > 0) {
        lines.push(`  rowActions: [${ap.rowActions.join(", ")}]`);
      }
      if (ap.topActions && ap.topActions.length > 0) {
        lines.push(`  topActions: [${ap.topActions.join(", ")}]`);
      }
      if (ap.paginate !== undefined) lines.push(`  paginate: ${ap.paginate}`);
      if (ap.pageSize !== undefined) lines.push(`  pageSize: ${ap.pageSize}`);
      if (ap.fields && ap.fields.length > 0) {
        lines.push(`  fields: [${ap.fields.join(", ")}]`);
      }
      if (ap.layout) lines.push(`  layout: "${ap.layout}"`);
      if (ap.submitAction) lines.push(`  submitAction: ${ap.submitAction}`);
      if (ap.successRoute) lines.push(`  successRoute: "${ap.successRoute}"`);
      if (ap.auth !== undefined) lines.push(`  auth: ${ap.auth}`);
      if (ap.roles && ap.roles.length > 0) {
        lines.push(`  roles: [${ap.roles.join(", ")}]`);
      }
      lines.push(`}`, "");
    }

    return lines.join("\n");
  }
}
