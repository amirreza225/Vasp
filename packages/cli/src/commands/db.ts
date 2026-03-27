import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import { log } from "../utils/logger.js";

const DB_SUBCOMMANDS = [
  "push",
  "generate",
  "migrate",
  "studio",
  "seed",
] as const;
type DbSubcommand = (typeof DB_SUBCOMMANDS)[number];

export async function dbCommand(args: string[]): Promise<void> {
  const sub = args[0] as DbSubcommand | undefined;
  const projectDir = resolve(process.cwd());
  const pkgFile = join(projectDir, "package.json");

  if (!sub || !DB_SUBCOMMANDS.includes(sub)) {
    log.error(`Usage: vasp db <${DB_SUBCOMMANDS.join("|")}>`);
    if (sub) log.error(`Unknown subcommand: ${sub}`);
    process.exit(1);
  }

  const scriptName = `db:${sub}`;
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as {
      scripts?: Record<string, string>;
    };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log.error(
        "No package.json found. Run this command inside a Vasp project.",
      );
      process.exit(1);
    }
    throw err;
  }

  const script = pkg.scripts?.[scriptName];
  if (!script) {
    log.error(`No '${scriptName}' script found in package.json.`);
    process.exit(1);
  }

  log.step(`Running ${scriptName}...`);

  // Split the script string into tokens, respecting quoted arguments
  // e.g. `bunx drizzle-kit push --config "my config.ts"` → 4 tokens
  const cmdTokens = splitShellArgs(script);
  if (cmdTokens.length === 0) {
    log.error(`Script '${scriptName}' is empty.`);
    process.exit(1);
  }
  const proc = Bun.spawn(cmdTokens as [string, ...string[]], {
    cwd: projectDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const code = typeof exitCode === "number" ? exitCode : 1;
    log.error(`${scriptName} failed with exit code ${code}`);
    process.exit(code);
  }

  log.success(`${scriptName} completed`);
}

/**
 * Split a shell command string into tokens, respecting single- and double-quoted
 * arguments so that e.g. `bunx drizzle-kit push --config "my config.ts"` is
 * correctly split into 4 tokens instead of 5.
 */
function splitShellArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}
