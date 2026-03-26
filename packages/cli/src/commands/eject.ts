import { join, resolve, relative, dirname } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  cpSync,
  rmSync,
} from "node:fs";
import { log } from "../utils/logger.js";

function parseArgs(args: string[]): { confirm: boolean } {
  return { confirm: args.includes("--confirm") };
}

/**
 * Walk a directory recursively and return all file paths.
 */
function walkDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Rewrite `from '@vasp-framework/runtime'` imports in a file to a relative path.
 * Returns the rewritten content, or null if no changes were made.
 */
function rewriteRuntimeImport(
  content: string,
  fileDir: string,
  runtimeDir: string,
): string | null {
  const runtimeIndexJs = join(runtimeDir, "index.js");
  const relPath = relative(fileDir, runtimeIndexJs).replace(/\\/g, "/");
  const normalized = relPath.startsWith(".") ? relPath : `./${relPath}`;

  // Match both: import ... from '@vasp-framework/runtime'  (with single or double quotes)
  const importRegex = /(['"])@vasp-framework\/runtime\1/g;
  if (!/@vasp-framework\/runtime/.test(content)) return null;

  return content.replace(
    /(['"])@vasp-framework\/runtime\1/g,
    `$1${normalized}$1`,
  );
}

export async function ejectCommand(args: string[] = []): Promise<void> {
  const { confirm } = parseArgs(args);
  const projectDir = resolve(process.cwd());

  const pkgFile = join(projectDir, "package.json");
  if (!existsSync(pkgFile)) {
    log.error("No package.json found. Run this command inside a Vasp project.");
    process.exit(1);
  }

  if (!confirm) {
    log.warn("vasp eject — this is a one-way operation.");
    console.log();
    log.info("What this does:");
    log.dim(
      "  1. Copies @vasp-framework/runtime source into src/vasp/runtime/",
    );
    log.dim(
      '  2. Rewrites all imports from "@vasp-framework/runtime" to a local path',
    );
    log.dim("  3. Removes @vasp-framework/runtime from package.json");
    log.dim("  4. Deletes the .vasp/ metadata directory");
    log.dim("  5. Runs bun install to clean the lockfile");
    console.log();
    log.info(
      "After ejecting, main.vasp is preserved but `vasp generate` will no longer work.",
    );
    log.info("Your app becomes a standard Vue/Nuxt + Elysia project.");
    console.log();
    log.warn("Run with --confirm to proceed: vasp eject --confirm");
    process.exit(0);
  }

  log.step("Ejecting from Vasp framework...");
  console.log();

  // Step 1: Locate the runtime in node_modules
  const runtimePkg = join(
    projectDir,
    "node_modules",
    "@vasp-framework",
    "runtime",
  );
  if (!existsSync(runtimePkg)) {
    log.error("Could not find @vasp-framework/runtime in node_modules.");
    log.info("Run `bun install` first, then retry.");
    process.exit(1);
  }

  const runtimeDist = join(runtimePkg, "dist");
  if (!existsSync(runtimeDist)) {
    log.error("Runtime dist not found. The package may be corrupted.");
    process.exit(1);
  }

  // Step 2: Copy runtime dist into src/vasp/runtime/
  const targetRuntimeDir = join(projectDir, "src", "vasp", "runtime");
  log.info("Copying runtime source into src/vasp/runtime/...");
  mkdirSync(targetRuntimeDir, { recursive: true });
  cpSync(runtimeDist, targetRuntimeDir, { recursive: true });
  log.success("  Copied runtime to src/vasp/runtime/");

  // Step 3: Rewrite imports in src/ and server/ directories
  log.info("Rewriting @vasp-framework/runtime imports...");
  let rewriteCount = 0;
  const searchDirs = ["src", "server"].map((d) => join(projectDir, d));

  for (const searchDir of searchDirs) {
    const files = walkDir(searchDir).filter((f) => /\.(ts|js|vue)$/.test(f));
    for (const filePath of files) {
      const content = readFileSync(filePath, "utf8");
      const fileDir = dirname(filePath);
      const rewritten = rewriteRuntimeImport(
        content,
        fileDir,
        targetRuntimeDir,
      );
      if (rewritten !== null) {
        writeFileSync(filePath, rewritten, "utf8");
        log.dim(`  Rewrote imports in ${relative(projectDir, filePath)}`);
        rewriteCount++;
      }
    }
  }

  if (rewriteCount === 0) {
    log.dim("  No files imported @vasp-framework/runtime directly.");
  } else {
    log.success(`  Rewrote ${rewriteCount} file(s)`);
  }

  // Step 4: Remove @vasp-framework/runtime from package.json
  log.info("Removing @vasp-framework/runtime from package.json...");
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (pkg.dependencies?.["@vasp-framework/runtime"]) {
    delete pkg.dependencies["@vasp-framework/runtime"];
    writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    log.success("  Removed @vasp-framework/runtime from dependencies");
  } else {
    log.dim("  @vasp-framework/runtime was not in dependencies — skipping");
  }

  // Step 5: Delete .vasp/ directory
  const vaspDir = join(projectDir, ".vasp");
  if (existsSync(vaspDir)) {
    log.info("Removing .vasp/ metadata directory...");
    rmSync(vaspDir, { recursive: true, force: true });
    log.success("  Deleted .vasp/");
  }

  // Step 6: Run bun install to clean lockfile
  log.info("Running bun install to update lockfile...");
  const installProc = Bun.spawn(["bun", "install"], {
    cwd: projectDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const installCode = await installProc.exited;
  if (installCode !== 0) {
    log.warn("bun install exited with a non-zero code — review output above.");
  } else {
    log.success("  lockfile updated");
  }

  console.log();
  log.step("Eject complete!");
  log.info("Your app is now a standard Vue/Nuxt + Elysia project.");
  log.dim(
    "  main.vasp is preserved for reference but `vasp generate` will no longer work.",
  );
  log.dim(
    "  Runtime composables are in src/vasp/runtime/ — feel free to customize them.",
  );
}
