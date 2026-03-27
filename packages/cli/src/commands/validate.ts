import { readFileSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { parseAll, formatDiagnostics } from "@vasp-framework/parser";
import pc from "picocolors";
import { log } from "../utils/logger.js";

interface ValidateOptions {
  watch: boolean;
  strict: boolean;
  file: string;
}

/**
 * `vasp validate` — lint and validate a .vasp file without generating code.
 *
 * Options:
 *   --watch, -w    Re-validate whenever the file changes (Ctrl+C to stop)
 *   --strict       Also report best-practice warnings (W-codes) in addition to errors
 */
export async function validateCommand(args: string[]): Promise<void> {
  const opts = parseOptions(args);
  const projectDir = resolve(process.cwd());
  const vaspFile = join(projectDir, opts.file);

  try {
    readFileSync(vaspFile);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log.error(
        `${opts.file} not found. Run 'vasp validate' from your project root.`,
      );
      process.exit(1);
    }
    throw err;
  }

  if (opts.watch) {
    log.step(`Watching ${opts.file} for changes... (Ctrl+C to stop)`);
    runValidation(vaspFile, opts);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    watch(vaspFile, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log();
        log.step(`${opts.file} changed — re-validating...`);
        runValidation(vaspFile, opts);
      }, 100);
    });

    // Blocks forever — the fs.watch() callback keeps the event loop alive
    // until the user sends SIGINT (Ctrl+C).
    await new Promise<never>(() => {});
  } else {
    const ok = runValidation(vaspFile, opts);
    if (!ok) process.exit(1);
  }
}

/** Run a single validation pass. Returns true if the file is valid (no errors). */
function runValidation(vaspFile: string, opts: ValidateOptions): boolean {
  const source = readFileSync(vaspFile, "utf8");
  const filename = opts.file;
  const { diagnostics, hasErrors } = parseAll(source, filename);

  const errors = diagnostics.filter((d) => d.code.startsWith("E"));
  const warnings = diagnostics.filter((d) => d.code.startsWith("W"));

  if (errors.length > 0) {
    const formatted = formatDiagnostics(errors, source, filename);
    console.error("\n" + formatted + "\n");
    console.error(
      `${pc.red(pc.bold("Validation failed:"))} Found ${errors.length} error${errors.length === 1 ? "" : "s"} in ${filename}\n`,
    );
  }

  if (opts.strict && warnings.length > 0) {
    const formatted = formatDiagnostics(warnings, source, filename);
    console.warn("\n" + formatted + "\n");
    log.warn(
      `Found ${warnings.length} warning${warnings.length === 1 ? "" : "s"} in ${filename}`,
    );
  }

  if (!hasErrors) {
    if (opts.strict && warnings.length > 0) {
      log.warn(
        `${filename} is valid with ${warnings.length} warning${warnings.length === 1 ? "" : "s"} (--strict)`,
      );
    } else {
      log.success(`${filename} is valid`);
    }
    return true;
  }

  return false;
}

function parseOptions(args: string[]): ValidateOptions {
  const file = args.find((a) => !a.startsWith("-")) ?? "main.vasp";
  return {
    watch: args.includes("--watch") || args.includes("-w"),
    strict: args.includes("--strict"),
    file,
  };
}
