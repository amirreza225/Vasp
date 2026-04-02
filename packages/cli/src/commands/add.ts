import { parse, AstSerializer } from "@vasp-framework/parser";
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
  FieldNode,
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
  VaspAST,
  VaspNode,
  WebhookNode,
} from "@vasp-framework/core";
import { join, resolve } from "node:path";
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  constants,
  mkdirSync,
} from "node:fs";
import { log } from "../utils/logger.js";
import { handleParseError } from "../utils/parse-error.js";
import { runRegenerate } from "./generate.js";

const KNOWN_SUB_COMMANDS = [
  "entity",
  "page",
  "crud",
  "query",
  "action",
  "job",
  "auth",
  "api",
  "storage",
  "email",
  "cache",
  "webhook",
  "observability",
  "autoPage",
  "realtime",
  "route",
  "seed",
  "middleware",
  "admin",
] as const;
type AddSubCommand = (typeof KNOWN_SUB_COMMANDS)[number];

const DUMMY_LOC: SourceLocation = { line: 0, col: 0, offset: 0 };

function printAddHelp(): void {
  console.log(`
  vasp add — incrementally add a new block to main.vasp

  Usage:
    vasp add entity      <Name>                                  Add an entity (database table)
    vasp add page        <Name> [--path=/path]                   Add a page + route block
    vasp add route       <Name> --path=/path --to=PageName       Add a standalone route
    vasp add crud        <EntityName>                            Add CRUD endpoints for an entity
    vasp add query       <name> [--entity=Entity]                Add a query block + function stub
    vasp add action      <name> [--entity=Entity]                Add an action block + function stub
    vasp add job         <name> [--executor=PgBoss]              Add a background job + function stub
    vasp add auth                                                Add an auth block (+ User entity if missing)
    vasp add api         <name> [--method=GET] [--path=/path]    Add a custom API endpoint
    vasp add storage     <Name> [--provider=local]               Add a file storage block
    vasp add email       <Name> [--provider=resend] [--from=...] Add an email provider block
    vasp add cache       <Name> [--provider=memory]              Add a cache block
    vasp add webhook     <Name> [--mode=inbound] [--path=/path]  Add an inbound webhook receiver
    vasp add webhook     <Name> --mode=outbound --entity=Entity  Add an outbound webhook dispatcher
    vasp add observability                                       Add an observability block
    vasp add autoPage    <Name> --entity=Entity [--type=list]    Add an auto-generated page
    vasp add realtime    <Name> [--entity=Entity]                Add a realtime channel
    vasp add seed                                                Add a database seed block
    vasp add middleware  <name> [--scope=global]                 Add a custom middleware
    vasp add admin       [--entities=Entity1,Entity2]            Add the admin panel block

  Examples:
    vasp add entity      Post
    vasp add page        Dashboard --path=/dashboard
    vasp add route       AboutRoute --path=/about --to=AboutPage
    vasp add crud        Post
    vasp add query       getPostById --entity=Post
    vasp add action      createPost --entity=Post
    vasp add job         sendWelcomeEmail --executor=PgBoss
    vasp add auth
    vasp add api         webhookReceiver --method=POST --path=/api/webhooks
    vasp add storage     Avatars --provider=s3
    vasp add email       Mailer --provider=resend --from=noreply@myapp.com
    vasp add cache       AppCache --provider=redis
    vasp add webhook     StripeWebhook --mode=inbound --path=/webhooks/stripe
    vasp add webhook     PostEvents --mode=outbound --entity=Post
    vasp add observability
    vasp add autoPage    PostList --entity=Post --type=list --path=/posts
    vasp add realtime    PostChannel --entity=Post
    vasp add seed
    vasp add middleware  requestLogger --scope=global
    vasp add admin       --entities=Post,User
  `);
}

export async function addCommand(args: string[]): Promise<void> {
  const sub = args[0] as AddSubCommand | undefined;

  if (!sub || !KNOWN_SUB_COMMANDS.includes(sub as AddSubCommand)) {
    if (sub) log.error(`Unknown sub-command: vasp add ${sub}`);
    printAddHelp();
    if (sub) process.exit(1);
    return;
  }

  const projectDir = resolve(process.cwd());
  const vaspFile = join(projectDir, "main.vasp");

  let source: string;
  try {
    source = readFileSync(vaspFile, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log.error(
        `No main.vasp found in ${projectDir}. Run this command from your project root.`,
      );
      process.exit(1);
    }
    throw err;
  }
  let ast: VaspAST;
  try {
    ast = parse(source, "main.vasp");
  } catch (err) {
    handleParseError(err, source, "main.vasp");
    return; // unreachable — handleParseError calls process.exit
  }

  const serializer = new AstSerializer();
  const ext = ast.app!.typescript ? "ts" : "js";
  const name = args[1];

  switch (sub) {
    // ------------------------------------------------------------------
    // vasp add entity <Name>
    // ------------------------------------------------------------------
    case "entity": {
      if (!name) {
        log.error("Usage: vasp add entity <Name>");
        process.exit(1);
      }
      const entityName = toPascal(name);
      if (ast.entities.some((e) => e.name === entityName)) {
        log.error(`Entity '${entityName}' already exists in main.vasp`);
        process.exit(1);
      }
      const node: EntityNode = {
        type: "Entity",
        name: entityName,
        loc: DUMMY_LOC,
        fields: [
          makeField("id", "Int", ["id"]),
          makeField("createdAt", "DateTime", ["default_now"], {
            defaultValue: "now",
          }),
        ],
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added entity '${entityName}' to main.vasp`);
      log.dim(`  Add fields inside the block, then run: vasp generate`);
      break;
    }

    // ------------------------------------------------------------------
    // vasp add page <Name> [--path=/path]
    // ------------------------------------------------------------------
    case "page": {
      if (!name) {
        log.error("Usage: vasp add page <Name> [--path=/path]");
        process.exit(1);
      }
      const pageName = toPascal(name);
      const pathArg = argValue(args, "--path") ?? `/${toKebab(name)}`;
      const routeName = `${pageName}Route`;

      if (ast.pages.some((p) => p.name === pageName)) {
        log.error(`Page '${pageName}' already exists in main.vasp`);
        process.exit(1);
      }
      if (ast.routes.some((r) => r.path === pathArg)) {
        log.error(`Route with path '${pathArg}' already exists in main.vasp`);
        process.exit(1);
      }

      const routeNode: RouteNode = {
        type: "Route",
        name: routeName,
        loc: DUMMY_LOC,
        path: pathArg,
        to: pageName,
        params: extractParams(pathArg),
      };
      const pageNode: PageNode = {
        type: "Page",
        name: pageName,
        loc: DUMMY_LOC,
        component: {
          kind: "default",
          defaultExport: pageName,
          source: `@src/pages/${pageName}.vue`,
        },
      };
      appendToVasp(
        vaspFile,
        source,
        wrapBlock(serializer.serializeMany([routeNode, pageNode])),
      );
      log.success(
        `Added route '${routeName}' (${pathArg}) and page '${pageName}' to main.vasp`,
      );

      // Create the Vue component stub if it doesn't exist yet
      const pageDir = join(projectDir, "src", "pages");
      const pageFile = join(pageDir, `${pageName}.vue`);
      mkdirSync(pageDir, { recursive: true });
      try {
        const fd = openSync(
          pageFile,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o666,
        );
        writeFileSync(fd, buildVueStub(pageName), "utf8");
        closeSync(fd);
        log.success(`Created src/pages/${pageName}.vue`);
      } catch (err: any) {
        if (err.code === "EEXIST") {
          log.dim(`  src/pages/${pageName}.vue already exists — skipping`);
        } else {
          throw err;
        }
      }
      break;
    }

    // ------------------------------------------------------------------
    // vasp add route <Name> --path=/path --to=PageName
    // ------------------------------------------------------------------
    case "route": {
      if (!name) {
        log.error("Usage: vasp add route <Name> --path=/path --to=PageName");
        process.exit(1);
      }
      const routeName = toPascal(name);
      const routePath = argValue(args, "--path");
      const routeTo = argValue(args, "--to");
      if (!routePath) {
        log.error("--path is required for vasp add route");
        process.exit(1);
      }
      if (!routeTo) {
        log.error("--to is required for vasp add route");
        process.exit(1);
      }
      if (ast.routes.some((r) => r.name === routeName)) {
        log.error(`Route '${routeName}' already exists in main.vasp`);
        process.exit(1);
      }
      if (ast.routes.some((r) => r.path === routePath)) {
        log.error(`Route with path '${routePath}' already exists in main.vasp`);
        process.exit(1);
      }
      const node: RouteNode = {
        type: "Route",
        name: routeName,
        loc: DUMMY_LOC,
        path: routePath,
        to: routeTo,
        params: extractParams(routePath),
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added route '${routeName}' (${routePath}) to main.vasp`);
      break;
    }

    // ------------------------------------------------------------------
    // vasp add crud <EntityName>
    // ------------------------------------------------------------------
    case "crud": {
      if (!name) {
        log.error("Usage: vasp add crud <EntityName>");
        process.exit(1);
      }
      const entityName = toPascal(name);
      if (
        ast.entities.length > 0 &&
        !ast.entities.some((e) => e.name === entityName)
      ) {
        log.error(`Entity '${entityName}' does not exist in main.vasp`);
        log.dim(`  Run: vasp add entity ${entityName}`);
        process.exit(1);
      }
      if (ast.cruds.some((c) => c.entity === entityName)) {
        log.error(
          `A crud block for '${entityName}' already exists in main.vasp`,
        );
        process.exit(1);
      }
      const node: CrudNode = {
        type: "Crud",
        name: entityName,
        loc: DUMMY_LOC,
        entity: entityName,
        operations: ["list", "create", "update", "delete"],
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added crud block for '${entityName}' to main.vasp`);
      break;
    }

    // ------------------------------------------------------------------
    // vasp add query <name> [--entity=Entity]
    // ------------------------------------------------------------------
    case "query": {
      if (!name) {
        log.error("Usage: vasp add query <name> [--entity=Entity]");
        process.exit(1);
      }
      const fnName = toCamel(name);
      if (ast.queries.some((q) => q.name === fnName)) {
        log.error(`Query '${fnName}' already exists in main.vasp`);
        process.exit(1);
      }
      const entityArg = argValue(args, "--entity");
      const entities = entityArg ? [toPascal(entityArg)] : [];
      const node: QueryNode = {
        type: "Query",
        name: fnName,
        loc: DUMMY_LOC,
        fn: {
          kind: "named",
          namedExport: fnName,
          source: `@src/queries.${ext}`,
        },
        entities,
        auth: false,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added query '${fnName}' to main.vasp`);
      const entityFields = entityArg
        ? lookupEntityFields(ast, toPascal(entityArg))
        : undefined;
      appendFunctionStub(
        projectDir,
        `queries.${ext}`,
        fnName,
        ext,
        "query",
        entityFields,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add action <name> [--entity=Entity]
    // ------------------------------------------------------------------
    case "action": {
      if (!name) {
        log.error("Usage: vasp add action <name> [--entity=Entity]");
        process.exit(1);
      }
      const fnName = toCamel(name);
      if (ast.actions.some((a) => a.name === fnName)) {
        log.error(`Action '${fnName}' already exists in main.vasp`);
        process.exit(1);
      }
      const entityArg = argValue(args, "--entity");
      const entities = entityArg ? [toPascal(entityArg)] : [];
      const node: ActionNode = {
        type: "Action",
        name: fnName,
        loc: DUMMY_LOC,
        fn: {
          kind: "named",
          namedExport: fnName,
          source: `@src/actions.${ext}`,
        },
        entities,
        auth: false,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added action '${fnName}' to main.vasp`);
      const entityFields = entityArg
        ? lookupEntityFields(ast, toPascal(entityArg))
        : undefined;
      appendFunctionStub(
        projectDir,
        `actions.${ext}`,
        fnName,
        ext,
        "action",
        entityFields,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add job <name> [--executor=PgBoss]
    // ------------------------------------------------------------------
    case "job": {
      if (!name) {
        log.error("Usage: vasp add job <name> [--executor=PgBoss]");
        process.exit(1);
      }
      const jobName = toCamel(name);
      if (ast.jobs.some((j) => j.name === jobName)) {
        log.error(`Job '${jobName}' already exists in main.vasp`);
        process.exit(1);
      }
      const executor =
        (argValue(args, "--executor") as JobNode["executor"] | undefined) ??
        "PgBoss";
      const node: JobNode = {
        type: "Job",
        name: jobName,
        loc: DUMMY_LOC,
        executor,
        perform: {
          fn: {
            kind: "named",
            namedExport: jobName,
            source: `@src/jobs.${ext}`,
          },
        },
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added job '${jobName}' to main.vasp`);
      appendFunctionStub(projectDir, `jobs.${ext}`, jobName, ext, "job");
      break;
    }

    // ------------------------------------------------------------------
    // vasp add auth
    // ------------------------------------------------------------------
    case "auth": {
      if (ast.auth) {
        log.error("An auth block already exists in main.vasp");
        process.exit(1);
      }
      const authName = `${ast.app!.name}Auth`;
      const hasUserEntity = ast.entities.some((e) => e.name === "User");

      const nodesToAdd: VaspNode[] = [];
      if (!hasUserEntity) {
        const userNode: EntityNode = {
          type: "Entity",
          name: "User",
          loc: DUMMY_LOC,
          fields: [
            makeField("id", "Int", ["id"]),
            makeField("username", "String", ["unique"]),
            makeField("email", "String", ["unique"]),
          ],
        };
        nodesToAdd.push(userNode);
      }
      const authNode: AuthNode = {
        type: "Auth",
        name: authName,
        loc: DUMMY_LOC,
        userEntity: "User",
        methods: ["usernameAndPassword"],
      };
      nodesToAdd.push(authNode);

      appendToVasp(
        vaspFile,
        source,
        wrapBlock(serializer.serializeMany(nodesToAdd)),
      );
      log.success(`Added auth '${authName}' to main.vasp`);
      if (!hasUserEntity) {
        log.success(`Added entity 'User' to main.vasp`);
      }
      log.dim(
        `  You can add more auth methods (google, github) to the methods list`,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add api <name> [--method=GET] [--path=/path]
    // ------------------------------------------------------------------
    case "api": {
      if (!name) {
        log.error("Usage: vasp add api <name> [--method=GET] [--path=/path]");
        process.exit(1);
      }
      const apiName = toCamel(name);
      const methodArg = (
        argValue(args, "--method") ?? "GET"
      ).toUpperCase() as ApiNode["method"];
      const pathArg = argValue(args, "--path") ?? `/api/${toKebab(name)}`;

      if (ast.apis.some((a) => a.name === apiName)) {
        log.error(`API '${apiName}' already exists in main.vasp`);
        process.exit(1);
      }
      const node: ApiNode = {
        type: "Api",
        name: apiName,
        loc: DUMMY_LOC,
        method: methodArg,
        path: pathArg,
        fn: {
          kind: "named",
          namedExport: apiName,
          source: `@src/api.${ext}`,
        },
        auth: false,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(
        `Added api '${apiName}' (${methodArg} ${pathArg}) to main.vasp`,
      );
      appendFunctionStub(projectDir, `api.${ext}`, apiName, ext, "api");
      break;
    }

    // ------------------------------------------------------------------
    // vasp add storage <Name> [--provider=local|s3|r2|gcs]
    // ------------------------------------------------------------------
    case "storage": {
      if (!name) {
        log.error("Usage: vasp add storage <Name> [--provider=local]");
        process.exit(1);
      }
      const storageName = toPascal(name);
      if (ast.storages.some((s) => s.name === storageName)) {
        log.error(`Storage '${storageName}' already exists in main.vasp`);
        process.exit(1);
      }
      const provider =
        (argValue(args, "--provider") as StorageNode["provider"] | undefined) ??
        "local";
      const node: StorageNode = {
        type: "Storage",
        name: storageName,
        loc: DUMMY_LOC,
        provider,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added storage '${storageName}' to main.vasp`);
      break;
    }

    // ------------------------------------------------------------------
    // vasp add email <Name> [--provider=resend] [--from=noreply@example.com]
    // ------------------------------------------------------------------
    case "email": {
      if (!name) {
        log.error(
          "Usage: vasp add email <Name> [--provider=resend] [--from=noreply@example.com]",
        );
        process.exit(1);
      }
      const emailName = toPascal(name);
      if (ast.emails.some((e) => e.name === emailName)) {
        log.error(`Email '${emailName}' already exists in main.vasp`);
        process.exit(1);
      }
      const provider =
        (argValue(args, "--provider") as EmailNode["provider"] | undefined) ??
        "resend";
      const from =
        argValue(args, "--from") ?? `noreply@${toKebab(ast.app!.name)}.com`;
      const node: EmailNode = {
        type: "Email",
        name: emailName,
        loc: DUMMY_LOC,
        provider,
        from,
        templates: [],
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added email '${emailName}' to main.vasp`);
      log.dim(
        `  Add email templates inside the templates block, then run: vasp generate`,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add cache <Name> [--provider=memory|redis|valkey]
    // ------------------------------------------------------------------
    case "cache": {
      if (!name) {
        log.error("Usage: vasp add cache <Name> [--provider=memory]");
        process.exit(1);
      }
      const cacheName = toPascal(name);
      if (ast.caches.some((c) => c.name === cacheName)) {
        log.error(`Cache '${cacheName}' already exists in main.vasp`);
        process.exit(1);
      }
      const provider =
        (argValue(args, "--provider") as CacheNode["provider"] | undefined) ??
        "memory";
      const node: CacheNode = {
        type: "Cache",
        name: cacheName,
        loc: DUMMY_LOC,
        provider,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added cache '${cacheName}' to main.vasp`);
      break;
    }

    // ------------------------------------------------------------------
    // vasp add webhook <Name> [--mode=inbound|outbound]
    //   inbound:  [--path=/webhooks/...] [--verify=stripe-signature|github-signature|hmac]
    //   outbound: --entity=EntityName [--events=created,updated,deleted]
    // ------------------------------------------------------------------
    case "webhook": {
      if (!name) {
        log.error(
          "Usage: vasp add webhook <Name> [--mode=inbound|outbound] ...",
        );
        process.exit(1);
      }
      const webhookName = toPascal(name);
      if (ast.webhooks.some((w) => w.name === webhookName)) {
        log.error(`Webhook '${webhookName}' already exists in main.vasp`);
        process.exit(1);
      }
      const mode =
        (argValue(args, "--mode") as WebhookNode["mode"] | undefined) ??
        "inbound";
      let node: WebhookNode;
      if (mode === "inbound") {
        const wPath = argValue(args, "--path") ?? `/webhooks/${toKebab(name)}`;
        const fnName = toCamel(name);
        node = {
          type: "Webhook",
          name: webhookName,
          loc: DUMMY_LOC,
          mode: "inbound",
          path: wPath,
          fn: {
            kind: "named",
            namedExport: `handle${webhookName}`,
            source: `@src/webhooks/${toKebab(name)}.${ext}`,
          },
        };
        appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
        log.success(
          `Added inbound webhook '${webhookName}' (${wPath}) to main.vasp`,
        );
        appendFunctionStub(
          projectDir,
          `webhooks/${toKebab(name)}.${ext}`,
          `handle${webhookName}`,
          ext,
          "webhook",
        );
      } else {
        const entityArg = argValue(args, "--entity");
        if (!entityArg) {
          log.error("--entity is required for outbound webhooks");
          process.exit(1);
        }
        const entityName = toPascal(entityArg);
        if (
          ast.entities.length > 0 &&
          !ast.entities.some((e) => e.name === entityName)
        ) {
          log.error(`Entity '${entityName}' does not exist in main.vasp`);
          process.exit(1);
        }
        const eventsArg = argValue(args, "--events");
        const events = eventsArg
          ? eventsArg.split(",").map((e) => e.trim())
          : ["created", "updated", "deleted"];
        node = {
          type: "Webhook",
          name: webhookName,
          loc: DUMMY_LOC,
          mode: "outbound",
          entity: entityName,
          events,
          targets: "WEBHOOK_URLS",
        };
        appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
        log.success(
          `Added outbound webhook '${webhookName}' for '${entityName}' to main.vasp`,
        );
        log.dim(
          `  Set WEBHOOK_URLS env var to a comma-separated list of target URLs`,
        );
      }
      break;
    }

    // ------------------------------------------------------------------
    // vasp add observability
    // ------------------------------------------------------------------
    case "observability": {
      if (ast.observability) {
        log.error("An observability block already exists in main.vasp");
        process.exit(1);
      }
      const node: ObservabilityNode = {
        type: "Observability",
        loc: DUMMY_LOC,
        tracing: false,
        metrics: false,
        logs: "console",
        exporter: "console",
        errorTracking: "none",
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added observability block to main.vasp`);
      log.dim(
        `  Enable tracing/metrics and choose an exporter, then run: vasp generate`,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add autoPage <Name> --entity=Entity [--type=list|form|detail] [--path=/path]
    // ------------------------------------------------------------------
    case "autoPage": {
      if (!name) {
        log.error(
          "Usage: vasp add autoPage <Name> --entity=Entity [--type=list|form|detail] [--path=/path]",
        );
        process.exit(1);
      }
      const pageName = toPascal(name);
      const entityArg = argValue(args, "--entity");
      if (!entityArg) {
        log.error("--entity is required for vasp add autoPage");
        process.exit(1);
      }
      const entityName = toPascal(entityArg);
      if (
        ast.entities.length > 0 &&
        !ast.entities.some((e) => e.name === entityName)
      ) {
        log.error(`Entity '${entityName}' does not exist in main.vasp`);
        process.exit(1);
      }
      if (ast.autoPages.some((p) => p.name === pageName)) {
        log.error(`AutoPage '${pageName}' already exists in main.vasp`);
        process.exit(1);
      }
      const pageType =
        (argValue(args, "--type") as AutoPageNode["pageType"] | undefined) ??
        "list";
      const pagePath =
        argValue(args, "--path") ??
        `/${toKebab(entityArg)}${pageType === "list" ? "s" : ""}`;
      const node: AutoPageNode = {
        type: "AutoPage",
        name: pageName,
        loc: DUMMY_LOC,
        entity: entityName,
        path: pagePath,
        pageType,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(
        `Added autoPage '${pageName}' (${pageType}) for '${entityName}' to main.vasp`,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add realtime <Name> [--entity=Entity]
    // ------------------------------------------------------------------
    case "realtime": {
      if (!name) {
        log.error("Usage: vasp add realtime <Name> [--entity=Entity]");
        process.exit(1);
      }
      const channelName = toPascal(name);
      const entityArg = argValue(args, "--entity");
      if (!entityArg) {
        log.error("--entity is required for vasp add realtime");
        process.exit(1);
      }
      const entityName = toPascal(entityArg);
      if (
        ast.entities.length > 0 &&
        !ast.entities.some((e) => e.name === entityName)
      ) {
        log.error(`Entity '${entityName}' does not exist in main.vasp`);
        process.exit(1);
      }
      if (!ast.cruds.some((c) => c.entity === entityName)) {
        log.error(
          `Entity '${entityName}' has no crud block. Run: vasp add crud ${entityName}`,
        );
        process.exit(1);
      }
      if (ast.realtimes.some((r) => r.entity === entityName)) {
        log.error(
          `A realtime block for '${entityName}' already exists in main.vasp`,
        );
        process.exit(1);
      }
      const node: RealtimeNode = {
        type: "Realtime",
        name: channelName,
        loc: DUMMY_LOC,
        entity: entityName,
        events: ["created", "updated", "deleted"],
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(
        `Added realtime channel '${channelName}' for '${entityName}' to main.vasp`,
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add seed
    // ------------------------------------------------------------------
    case "seed": {
      if (ast.seed) {
        log.error("A seed block already exists in main.vasp");
        process.exit(1);
      }
      const node: SeedNode = {
        type: "Seed",
        loc: DUMMY_LOC,
        fn: {
          kind: "named",
          namedExport: "seed",
          source: `@src/seed.${ext}`,
        },
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added seed block to main.vasp`);
      appendFunctionStub(projectDir, `seed.${ext}`, "seed", ext, "seed");
      break;
    }

    // ------------------------------------------------------------------
    // vasp add middleware <name> [--scope=global|route]
    // ------------------------------------------------------------------
    case "middleware": {
      if (!name) {
        log.error("Usage: vasp add middleware <name> [--scope=global|route]");
        process.exit(1);
      }
      const mwName = toCamel(name);
      if (ast.middlewares.some((m) => m.name === mwName)) {
        log.error(`Middleware '${mwName}' already exists in main.vasp`);
        process.exit(1);
      }
      const scope =
        (argValue(args, "--scope") as MiddlewareNode["scope"] | undefined) ??
        "global";
      const node: MiddlewareNode = {
        type: "Middleware",
        name: mwName,
        loc: DUMMY_LOC,
        fn: {
          kind: "default",
          defaultExport: mwName,
          source: `@src/middleware/${toKebab(name)}.${ext}`,
        },
        scope,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added middleware '${mwName}' to main.vasp`);
      appendFunctionStub(
        projectDir,
        `middleware/${toKebab(name)}.${ext}`,
        mwName,
        ext,
        "middleware",
      );
      break;
    }

    // ------------------------------------------------------------------
    // vasp add admin [--entities=Entity1,Entity2]
    // ------------------------------------------------------------------
    case "admin": {
      if (ast.admin) {
        log.error("An admin block already exists in main.vasp");
        process.exit(1);
      }
      const entitiesArg = argValue(args, "--entities");
      const entities = entitiesArg
        ? entitiesArg.split(",").map((e) => toPascal(e.trim()))
        : ast.entities.map((e) => e.name);
      const node: AdminNode = {
        type: "Admin",
        loc: DUMMY_LOC,
        entities,
      };
      appendToVasp(vaspFile, source, wrapBlock(serializer.serialize(node)));
      log.success(`Added admin block to main.vasp`);
      break;
    }
  }

  // Re-generate after updating main.vasp
  log.step("Regenerating from main.vasp...");
  const result = await runRegenerate(projectDir);
  if (result.success) {
    const parts: string[] = [];
    if (result.added > 0) parts.push(`+${result.added} added`);
    if (result.updated > 0) parts.push(`~${result.updated} updated`);
    if (result.skipped > 0) parts.push(`${result.skipped} preserved`);
    log.success(`Done — ${parts.join(", ") || "no changes"}`);
  } else {
    log.error("Regeneration failed:");
    for (const err of result.errors) log.error(err);
    log.dim("Fix the error in main.vasp and run: vasp generate");
    process.exit(1);
  }
}

// ---------- helpers ----------

/**
 * Validate + append a DSL block to main.vasp.
 *
 * The combined source (existing content + new block) is parsed through the
 * full AST pipeline *before* writing to disk.  If the generated block is
 * malformed the process exits with a clear diagnostic and main.vasp is left
 * untouched.
 *
 * Exported for unit testing.
 */
export function appendToVasp(
  vaspFile: string,
  currentSource: string,
  block: string,
): void {
  const newSource = currentSource.trimEnd() + "\n" + block;
  try {
    parse(newSource, "main.vasp");
  } catch (err) {
    handleParseError(err, newSource, "main.vasp");
  }
  writeFileSync(vaspFile, newSource, "utf8");
}

/** Wrap serialised DSL text with leading/trailing newlines for clean appending to main.vasp. */
function wrapBlock(dsl: string): string {
  return "\n" + dsl + "\n";
}

/** Parse `--key=value` from an args array and return the value portion, or undefined. */
function argValue(args: string[], key: string): string | undefined {
  const prefix = `${key}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** Extract route parameter names from a path string, e.g. `"/posts/:id"` → `["id"]`. */
function extractParams(path: string): string[] {
  return (path.match(/:(\w+)/g) ?? []).map((p) => p.slice(1));
}

/** Build a minimal FieldNode for use inside a stub EntityNode, avoiding verbose object literals at call sites. */
function makeField(
  name: string,
  type: string,
  modifiers: FieldNode["modifiers"],
  extra?: Partial<FieldNode>,
): FieldNode {
  return {
    name,
    type,
    modifiers,
    isRelation: false,
    isArray: false,
    nullable: false,
    isUpdatedAt: false,
    ...extra,
  };
}

/**
 * Map a Vasp DSL primitive field type to its TypeScript type string.
 * Used when generating typed function stubs for query/action handlers.
 */
function fieldTypeToTs(field: FieldNode): string {
  if (field.isRelation) return "number"; // FK column
  if (field.isArray) return "unknown[]";
  switch (field.type) {
    case "String":
    case "Text":
      return "string";
    case "Int":
    case "Float":
      return "number";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "Date";
    case "Json":
      return "unknown";
    case "Enum":
      return field.enumValues?.length
        ? field.enumValues.map((v) => `"${v}"`).join(" | ")
        : "string";
    case "File":
      return "string";
    default:
      return "unknown";
  }
}

/**
 * Look up an entity in the AST by name and return its fields as typed descriptors
 * suitable for generating typed `args` parameters in function stubs.
 * Returns `undefined` when the entity is not found.
 */
function lookupEntityFields(
  ast: VaspAST,
  entityName: string,
): Array<{ name: string; tsType: string }> | undefined {
  const entity = ast.entities.find((e) => e.name === entityName);
  if (!entity) return undefined;
  return entity.fields
    .filter((f) => !f.isArray) // skip virtual one-to-many relation fields
    .map((f) => ({ name: f.name, tsType: fieldTypeToTs(f) }));
}

type FunctionKind =
  | "query"
  | "action"
  | "job"
  | "api"
  | "seed"
  | "middleware"
  | "webhook";

/** Append a function stub to a src/ file, creating the file if needed. */
function appendFunctionStub(
  projectDir: string,
  filename: string,
  fnName: string,
  ext: string,
  kind: FunctionKind,
  entityFields?: Array<{ name: string; tsType: string }>,
): void {
  // Ensure parent directory exists (e.g. src/middleware/, src/webhooks/)
  const filePath = join(projectDir, "src", filename);
  const fileDir = filePath.slice(0, filePath.lastIndexOf("/"));
  mkdirSync(fileDir, { recursive: true });

  const stub = buildFunctionStub(fnName, ext, kind, entityFields);
  try {
    const existing = readFileSync(filePath, "utf8");
    writeFileSync(filePath, existing.trimEnd() + "\n\n" + stub + "\n", "utf8");
    log.success(`Added ${fnName} stub to src/${filename}`);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      writeFileSync(filePath, stub + "\n", "utf8");
      log.success(`Created src/${filename} with ${fnName} stub`);
    } else {
      throw err;
    }
  }
}

function buildFunctionStub(
  fnName: string,
  ext: string,
  kind: FunctionKind,
  entityFields?: Array<{ name: string; tsType: string }>,
): string {
  if (ext === "ts") {
    // Build a typed args object from entity fields when available
    const argsType =
      entityFields && entityFields.length > 0
        ? `{ ${entityFields.map((f) => `${f.name}?: ${f.tsType}`).join("; ")} }`
        : "unknown";

    switch (kind) {
      case "query":
        return `export async function ${fnName}({ db, user, args }: { db: any; user?: any; args?: ${argsType} }) {\n  // TODO: implement ${fnName}\n  return []\n}`;
      case "action":
        return `export async function ${fnName}({ db, user, args }: { db: any; user?: any; args?: ${argsType} }) {\n  // TODO: implement ${fnName}\n}`;
      case "job":
        return `export async function ${fnName}({ db, args }: { db: any; args?: unknown }) {\n  // TODO: implement ${fnName}\n}`;
      case "api":
        return `export async function ${fnName}({ db, user }: { db: any; user?: any }) {\n  // TODO: implement ${fnName}\n  return {}\n}`;
      case "seed":
        return `export async function seed({ db }: { db: any }) {\n  // TODO: seed the database\n}`;
      case "middleware":
        return `export default async function ${fnName}({ request, set }: { request: Request; set: any }) {\n  // TODO: implement ${fnName}\n}`;
      case "webhook":
        return `export async function ${fnName}({ body }: { body: unknown }) {\n  // TODO: handle webhook\n}`;
    }
  }

  // JavaScript stubs (no type annotations)
  switch (kind) {
    case "query":
      return `export async function ${fnName}({ db, user, args }) {\n  // TODO: implement ${fnName}\n  return []\n}`;
    case "action":
      return `export async function ${fnName}({ db, user, args }) {\n  // TODO: implement ${fnName}\n}`;
    case "job":
      return `export async function ${fnName}({ db, args }) {\n  // TODO: implement ${fnName}\n}`;
    case "api":
      return `export async function ${fnName}({ db, user }) {\n  // TODO: implement ${fnName}\n  return {}\n}`;
    case "seed":
      return `export async function seed({ db }) {\n  // TODO: seed the database\n}`;
    case "middleware":
      return `export default async function ${fnName}({ request, set }) {\n  // TODO: implement ${fnName}\n}`;
    case "webhook":
      return `export async function ${fnName}({ body }) {\n  // TODO: handle webhook\n}`;
  }
}

function buildVueStub(name: string): string {
  return `<script setup>
// ${name} page
</script>

<template>
  <div class="${toKebab(name)}-page">
    <h1>${name}</h1>
  </div>
</template>
`;
}

function toPascal(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}

function toCamel(str: string): string {
  const pascal = toPascal(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebab(str: string): string {
  return str
    .replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
    .replace(/^-/, "")
    .replace(/[-_\s]+/g, "-");
}
