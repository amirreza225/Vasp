import { parse } from "@vasp-framework/parser";
import { join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
] as const;
type AddSubCommand = (typeof KNOWN_SUB_COMMANDS)[number];

function printAddHelp(): void {
  console.log(`
  vasp add — incrementally add a new block to main.vasp

  Usage:
    vasp add entity <Name>                      Add an entity (database table)
    vasp add page   <Name> [--path=/path]       Add a page + route block
    vasp add crud   <EntityName>                Add CRUD endpoints for an entity
    vasp add query  <name>                      Add a query block + function stub
    vasp add action <name>                      Add an action block + function stub
    vasp add job    <name>                      Add a background job + function stub
    vasp add auth                               Add an auth block (+ User entity if missing)
    vasp add api    <name> [--method=GET]       Add a custom API endpoint

  Examples:
    vasp add entity Post
    vasp add page   Dashboard --path=/dashboard
    vasp add crud   Post
    vasp add query  getPostById
    vasp add action createPost
    vasp add job    sendWelcomeEmail
    vasp add auth
    vasp add api    webhookReceiver --method=POST --path=/api/webhooks
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

  if (!existsSync(vaspFile)) {
    log.error(
      `No main.vasp found in ${projectDir}. Run this command from your project root.`,
    );
    process.exit(1);
  }

  const source = readFileSync(vaspFile, "utf8");
  let ast;
  try {
    ast = parse(source, "main.vasp");
  } catch (err) {
    handleParseError(err, source, "main.vasp");
  }

  const ext = ast.app.typescript ? "ts" : "js";
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
      const block = [
        `\nentity ${entityName} {`,
        `  id: Int @id`,
        `  createdAt: DateTime @default(now)`,
        `}\n`,
      ].join("\n");
      appendToVasp(vaspFile, source, block);
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
      const pathArg = args
        .find((a) => a.startsWith("--path="))
        ?.slice("--path=".length);
      const routePath = pathArg ?? `/${toKebab(name)}`;
      const routeName = `${pageName}Route`;

      if (ast.pages.some((p) => p.name === pageName)) {
        log.error(`Page '${pageName}' already exists in main.vasp`);
        process.exit(1);
      }
      if (ast.routes.some((r) => r.path === routePath)) {
        log.error(`Route with path '${routePath}' already exists in main.vasp`);
        process.exit(1);
      }

      const block = [
        `\nroute ${routeName} {`,
        `  path: "${routePath}"`,
        `  to: ${pageName}`,
        `}`,
        ``,
        `page ${pageName} {`,
        `  component: import ${pageName} from "@src/pages/${pageName}.vue"`,
        `}\n`,
      ].join("\n");

      appendToVasp(vaspFile, source, block);
      log.success(
        `Added route '${routeName}' (${routePath}) and page '${pageName}' to main.vasp`,
      );

      // Create the Vue component stub if it doesn't exist yet
      const pageDir = join(projectDir, "src", "pages");
      const pageFile = join(pageDir, `${pageName}.vue`);
      if (!existsSync(pageFile)) {
        mkdirSync(pageDir, { recursive: true });
        writeFileSync(pageFile, buildVueStub(pageName), "utf8");
        log.success(`Created src/pages/${pageName}.vue`);
      } else {
        log.dim(`  src/pages/${pageName}.vue already exists — skipping`);
      }
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
      const block = [
        `\ncrud ${entityName} {`,
        `  entity: ${entityName}`,
        `  operations: [list, create, update, delete]`,
        `}\n`,
      ].join("\n");
      appendToVasp(vaspFile, source, block);
      log.success(`Added crud block for '${entityName}' to main.vasp`);
      break;
    }

    // ------------------------------------------------------------------
    // vasp add query <name>
    // ------------------------------------------------------------------
    case "query": {
      if (!name) {
        log.error("Usage: vasp add query <name>");
        process.exit(1);
      }
      const fnName = toCamel(name);
      if (ast.queries.some((q) => q.name === fnName)) {
        log.error(`Query '${fnName}' already exists in main.vasp`);
        process.exit(1);
      }
      const block = [
        `\nquery ${fnName} {`,
        `  fn: import { ${fnName} } from "@src/queries.${ext}"`,
        `  entities: []`,
        `}\n`,
      ].join("\n");
      appendToVasp(vaspFile, source, block);
      log.success(`Added query '${fnName}' to main.vasp`);
      appendFunctionStub(projectDir, `queries.${ext}`, fnName, ext, "query");
      break;
    }

    // ------------------------------------------------------------------
    // vasp add action <name>
    // ------------------------------------------------------------------
    case "action": {
      if (!name) {
        log.error("Usage: vasp add action <name>");
        process.exit(1);
      }
      const fnName = toCamel(name);
      if (ast.actions.some((a) => a.name === fnName)) {
        log.error(`Action '${fnName}' already exists in main.vasp`);
        process.exit(1);
      }
      const block = [
        `\naction ${fnName} {`,
        `  fn: import { ${fnName} } from "@src/actions.${ext}"`,
        `  entities: []`,
        `}\n`,
      ].join("\n");
      appendToVasp(vaspFile, source, block);
      log.success(`Added action '${fnName}' to main.vasp`);
      appendFunctionStub(projectDir, `actions.${ext}`, fnName, ext, "action");
      break;
    }

    // ------------------------------------------------------------------
    // vasp add job <name>
    // ------------------------------------------------------------------
    case "job": {
      if (!name) {
        log.error("Usage: vasp add job <name>");
        process.exit(1);
      }
      const jobName = toCamel(name);
      if (ast.jobs.some((j) => j.name === jobName)) {
        log.error(`Job '${jobName}' already exists in main.vasp`);
        process.exit(1);
      }
      const block = [
        `\njob ${jobName} {`,
        `  executor: PgBoss`,
        `  perform: {`,
        `    fn: import { ${jobName} } from "@src/jobs.${ext}"`,
        `  }`,
        `}\n`,
      ].join("\n");
      appendToVasp(vaspFile, source, block);
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
      const authName = `${ast.app.name}Auth`;
      const hasUserEntity = ast.entities.some((e) => e.name === "User");

      let block = "";
      if (!hasUserEntity) {
        block += [
          `\nentity User {`,
          `  id: Int @id`,
          `  username: String @unique`,
          `  email: String @unique`,
          `}`,
          ``,
        ].join("\n");
      }
      block += [
        `auth ${authName} {`,
        `  userEntity: User`,
        `  methods: [usernameAndPassword]`,
        `}\n`,
      ].join("\n");

      appendToVasp(vaspFile, source, block);
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
        args
          .find((a) => a.startsWith("--method="))
          ?.slice("--method=".length) ?? "GET"
      ).toUpperCase();
      const pathArg =
        args.find((a) => a.startsWith("--path="))?.slice("--path=".length) ??
        `/api/${toKebab(name)}`;

      if ((ast.apis ?? []).some((a) => a.name === apiName)) {
        log.error(`API '${apiName}' already exists in main.vasp`);
        process.exit(1);
      }
      const block = [
        `\napi ${apiName} {`,
        `  method: ${methodArg}`,
        `  path: "${pathArg}"`,
        `  fn: import { ${apiName} } from "@src/api.${ext}"`,
        `}\n`,
      ].join("\n");
      appendToVasp(vaspFile, source, block);
      log.success(
        `Added api '${apiName}' (${methodArg} ${pathArg}) to main.vasp`,
      );
      appendFunctionStub(projectDir, `api.${ext}`, apiName, ext, "api");
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

/** Append a DSL block to main.vasp, ensuring the file ends with a newline. */
function appendToVasp(
  vaspFile: string,
  currentSource: string,
  block: string,
): void {
  writeFileSync(vaspFile, currentSource.trimEnd() + "\n" + block, "utf8");
}

type FunctionKind = "query" | "action" | "job" | "api";

/** Append a function stub to a src/ file, creating the file if needed. */
function appendFunctionStub(
  projectDir: string,
  filename: string,
  fnName: string,
  ext: string,
  kind: FunctionKind,
): void {
  const filePath = join(projectDir, "src", filename);
  const stub = buildFunctionStub(fnName, ext, kind);
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf8");
    writeFileSync(filePath, existing.trimEnd() + "\n\n" + stub + "\n", "utf8");
    log.success(`Added ${fnName} stub to src/${filename}`);
  } else {
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(filePath, stub + "\n", "utf8");
    log.success(`Created src/${filename} with ${fnName} stub`);
  }
}

function buildFunctionStub(
  fnName: string,
  ext: string,
  kind: FunctionKind,
): string {
  if (ext === "ts") {
    switch (kind) {
      case "query":
        return `export async function ${fnName}({ db, user, args }: { db: any; user?: any; args?: any }) {\n  // TODO: implement ${fnName}\n  return []\n}`;
      case "action":
        return `export async function ${fnName}({ db, user, args }: { db: any; user?: any; args?: any }) {\n  // TODO: implement ${fnName}\n}`;
      case "job":
        return `export async function ${fnName}({ db, args }: { db: any; args?: any }) {\n  // TODO: implement ${fnName}\n}`;
      case "api":
        return `export async function ${fnName}({ db, user }: { db: any; user?: any }) {\n  // TODO: implement ${fnName}\n  return {}\n}`;
    }
  }
  switch (kind) {
    case "query":
      return `export async function ${fnName}({ db, user, args }) {\n  // TODO: implement ${fnName}\n  return []\n}`;
    case "action":
      return `export async function ${fnName}({ db, user, args }) {\n  // TODO: implement ${fnName}\n}`;
    case "job":
      return `export async function ${fnName}({ db, args }) {\n  // TODO: implement ${fnName}\n}`;
    case "api":
      return `export async function ${fnName}({ db, user }) {\n  // TODO: implement ${fnName}\n  return {}\n}`;
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
