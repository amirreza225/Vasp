import { log } from "./utils/logger.js";
import { newCommand } from "./commands/new.js";
import { generateCommand } from "./commands/generate.js";
import { migrateToTsCommand } from "./commands/migrate-to-ts.js";
import { enableSsrCommand } from "./commands/enable-ssr.js";
import { startCommand } from "./commands/start.js";
import { buildCommand } from "./commands/build.js";
import { deployCommand } from "./commands/deploy.js";
import { ejectCommand } from "./commands/eject.js";
import { dbCommand } from "./commands/db.js";
import { addCommand } from "./commands/add.js";
import { VASP_VERSION } from "@vasp-framework/core";

export async function run(args: string[]): Promise<void> {
  const command = args[0];

  switch (command) {
    case "new":
      await newCommand(args.slice(1));
      break;

    case "generate":
    case "gen":
      await generateCommand(args.slice(1));
      break;

    case "--version":
    case "-v":
      console.log(VASP_VERSION);
      break;

    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;

    case "start":
      await startCommand();
      break;

    case "build":
      await buildCommand();
      break;

    case "migrate-to-ts":
      await migrateToTsCommand();
      break;

    case "enable-ssr":
      await enableSsrCommand();
      break;

    case "deploy":
      await deployCommand(args.slice(1));
      break;

    case "eject":
      await ejectCommand(args.slice(1));
      break;

    case "db":
      await dbCommand(args.slice(1));
      break;

    case "add":
      await addCommand(args.slice(1));
      break;

    default:
      log.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
  vasp — declarative full-stack framework for Vue

  Usage:
    vasp new <project-name> [options]    Create a new Vasp project
    vasp add <type> [name] [options]     Add a block to an existing main.vasp
    vasp generate [options]              Regenerate from main.vasp (preserves user changes)
    vasp enable-ssr                      Convert existing SPA project to SSR (Nuxt 4)
    vasp migrate-to-ts                   Convert existing JS project to TypeScript
    vasp start                           Start the dev server (opens browser automatically)
    vasp build                           Build for production
    vasp db <push|generate|migrate|studio|seed>  Run database commands
    vasp deploy --target=<docker|fly|railway>    Generate deployment config files
    vasp eject                           Remove Vasp framework dependency

  Options for 'vasp new':
    --typescript, --ts    Enable TypeScript (default: JavaScript)
    --ssr                 Enable SSR via Nuxt 4 (default: SPA)
    --ssg                 Enable Static Site Generation via Nuxt 4
    --starter=<name>      Use a starter template (minimal, todo, recipe, todo-auth-ssr)
    --no-install          Skip bun install
    (runs interactive prompts when no options are provided)

  Blocks for 'vasp add':
    entity  <Name>                      Add an entity (database table)
    page    <Name> [--path=/path]       Add a page + route
    crud    <EntityName>                Add CRUD endpoints
    query   <name>                      Add a query + function stub
    action  <name>                      Add an action + function stub
    job     <name>                      Add a background job + function stub
    auth                                Add auth block (+ User entity if missing)
    api     <name> [--method=GET]       Add a custom API endpoint

  Options for 'vasp generate':
    --force, -f           Overwrite user-modified files
    --dry-run             Preview what would change without writing files

  Examples:
    vasp new my-app
    vasp new my-app --typescript --ssr
    vasp new my-app --starter=todo
    vasp add entity Post
    vasp add page Dashboard --path=/dashboard
    vasp add crud Post
    vasp add query getPostById
    vasp add action createPost
    vasp add job sendWelcomeEmail
    vasp add auth
    vasp generate
    vasp generate --dry-run
  `);
}
