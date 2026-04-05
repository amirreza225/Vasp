import { generate } from "@vasp-framework/generator";
import { parse } from "@vasp-framework/parser";
import { join, resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { log } from "../utils/logger.js";
import { handleParseError } from "../utils/parse-error.js";
import { VASP_VERSION } from "@vasp-framework/core";
import {
  resolveTemplateDir,
  resolveStartersDir,
} from "../utils/template-dir.js";
import { isInteractive, select, confirm } from "../utils/prompt.js";

const STARTERS_DIR = resolveStartersDir(import.meta.dirname);
const KNOWN_STARTERS = ["minimal", "todo", "todo-auth-ssr", "recipe"];

interface NewOptions {
  typescript: boolean;
  ssr: boolean;
  ssg: boolean;
  starter?: string;
  noInstall: boolean;
}

export async function newCommand(args: string[]): Promise<void> {
  const appName = args[0];

  if (!appName) {
    log.error("Please provide a project name: vasp new <project-name>");
    process.exit(1);
  }

  let opts = parseOptions(args.slice(1));

  // Run interactive prompts when stdin is a TTY and no flags/starter were provided.
  const hasExplicitFlags = args.slice(1).some((a) => a.startsWith("--"));
  if (isInteractive() && !hasExplicitFlags) {
    opts = await promptOptions();
  }

  const outputDir = resolve(process.cwd(), appName);

  log.step(`Creating Vasp app: ${appName}`);
  log.info(`Version: ${VASP_VERSION}`);

  // Resolve the main.vasp source — from starter or generated
  let vaspSource: string;
  if (opts.starter) {
    if (!KNOWN_STARTERS.includes(opts.starter)) {
      log.error(
        `Unknown starter '${opts.starter}'. Available: ${KNOWN_STARTERS.join(", ")}`,
      );
      process.exit(1);
    }
    const starterFile = join(STARTERS_DIR, `${opts.starter}.vasp`);
    try {
      vaspSource = readFileSync(starterFile, "utf8");
    } catch (err: any) {
      if (err.code === "ENOENT") {
        log.error(`Starter file not found: ${starterFile}`);
        process.exit(1);
      }
      throw err;
    }
    // Replace the app name to match the user's chosen name
    vaspSource = vaspSource.replace(/^app \w+/m, `app ${toPascal(appName)}`);
    log.info(`Starter: ${opts.starter}`);
  } else {
    log.info(
      `Mode: ${opts.ssg ? "SSG" : opts.ssr ? "SSR" : "SPA"} | Language: ${opts.typescript ? "TypeScript" : "JavaScript"}`,
    );
    vaspSource = buildInitialVasp(appName, opts);
  }

  // Parse it to get the AST
  let ast;
  try {
    ast = parse(vaspSource, "main.vasp");
  } catch (err) {
    handleParseError(err, vaspSource, "main.vasp");
  }

  const templateDir = resolveTemplateDir(import.meta.dirname);

  try {
    mkdirSync(outputDir);
  } catch (err: any) {
    if (err.code === "EEXIST") {
      log.error(`Directory '${appName}' already exists`);
      process.exit(1);
    }
    throw err;
  }

  const result = generate(ast, {
    outputDir,
    templateDir,
    logLevel: "info",
  });

  if (!result.success) {
    log.error("Generation failed:");
    for (const err of result.errors) log.error(err);
    process.exit(1);
  }

  log.success(`Created ${result.filesWritten.length} files`);

  if (!opts.noInstall) {
    log.step("Installing dependencies...");
    const proc = Bun.spawn(["bun", "install"], {
      cwd: outputDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const installCode = await proc.exited;
    if (installCode !== 0) {
      log.warn("bun install failed — run it manually inside your project");
    } else {
      log.success("Dependencies installed");
    }
  }

  log.step("🚀 Your Vasp app is ready!");
  log.dim("");
  log.dim(`  cd ${appName}`);
  log.dim("");
  log.dim("  # Make sure PostgreSQL is running, then push the schema:");
  log.dim("  bun run db:push");
  log.dim("");
  log.dim("  # Start the dev server:");
  log.dim("  vasp start");
  log.dim("");
  log.dim("  Edit .env to configure your database connection.");
}

function parseOptions(args: string[]): NewOptions {
  // Support both `--starter=todo` (equals form) and `--starter todo` (space form)
  const equalsForm = args.find((a) => a.startsWith("--starter="))?.split("=")[1];
  const spaceFormIdx = args.indexOf("--starter");
  const spaceForm =
    spaceFormIdx !== -1 && spaceFormIdx + 1 < args.length
      ? args[spaceFormIdx + 1]
      : undefined;
  // Equals form takes precedence; space form is used if the next arg is not another flag
  const starter =
    equalsForm ??
    (spaceForm && !spaceForm.startsWith("--") ? spaceForm : undefined);
  return {
    typescript: args.includes("--typescript") || args.includes("--ts"),
    ssr: args.includes("--ssr"),
    ssg: args.includes("--ssg"),
    noInstall: args.includes("--no-install"),
    ...(starter !== undefined && { starter }),
  };
}

/**
 * Ask a short series of questions when no CLI flags were given.
 * Lets first-time users discover TypeScript + SSR and starter templates
 * without needing to read the docs first.
 */
async function promptOptions(): Promise<NewOptions> {
  const starterChoices = [
    "None — blank project (just a home page)",
    "minimal — bare-bones app",
    "todo — Todo list with CRUD",
    "recipe — Recipe app with auth",
    "todo-auth-ssr — Todo + Auth + Nuxt SSR",
  ];
  const starterKeys = [undefined, "minimal", "todo", "recipe", "todo-auth-ssr"];

  const starterIdx = await select(
    "Which template would you like to use?",
    starterChoices,
  );
  const starter = starterKeys[starterIdx];

  // Starters already encode TS/SSR settings — only ask for blank projects
  if (starter !== undefined) {
    return {
      typescript: false,
      ssr: false,
      ssg: false,
      noInstall: false,
      starter,
    };
  }

  const typescript = await confirm("Enable TypeScript?", false);
  const ssr = await confirm("Enable SSR (Nuxt 4)?", false);

  return { typescript, ssr, ssg: false, noInstall: false };
}

function buildInitialVasp(appName: string, opts: NewOptions): string {
  const ssrValue = opts.ssg ? '"ssg"' : opts.ssr ? "true" : "false";
  return `app ${toPascal(appName)} {
  title: "${toTitle(appName)}"
  db: Drizzle
  ssr: ${ssrValue}
  typescript: ${opts.typescript}
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`;
}

function toPascal(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
}

function toTitle(str: string): string {
  return str.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
