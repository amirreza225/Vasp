import { join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Resolves the templates directory in both environments:
 *   Production:  binary at dist/vasp → templates copied to package root (../templates/)
 *   Development: source at src/commands/ → monorepo root templates (4 levels up)
 */
export function resolveTemplateDir(fromDir: string): string {
  const prod = join(fromDir, "..", "templates");
  if (existsSync(prod)) return prod;

  const dev = join(fromDir, "..", "..", "..", "..", "templates");
  if (existsSync(dev)) return dev;

  throw new Error(
    `Templates directory not found. Searched:\n  ${prod}\n  ${dev}\n` +
      `Run 'bun run build' inside packages/cli to copy templates.`,
  );
}

/**
 * Resolves the starters directory (.vasp starter files) in both environments:
 *   Production:  binary at dist/vasp → starters at package root (../starters/)
 *   Development: source at src/commands/ → packages/cli/starters/ (2 levels up)
 */
export function resolveStartersDir(fromDir: string): string {
  const prod = join(fromDir, "..", "starters");
  if (existsSync(prod)) return prod;

  const dev = join(fromDir, "..", "..", "starters");
  if (existsSync(dev)) return dev;

  throw new Error(
    `Starters directory not found. Searched:\n  ${prod}\n  ${dev}`,
  );
}
