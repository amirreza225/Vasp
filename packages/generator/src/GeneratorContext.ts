import type { VaspAST } from "@vasp-framework/core";
import { join } from "node:path";

export interface Logger {
  info(msg: string): void;
  verbose(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const silentLogger: Logger = {
  info: () => {},
  verbose: () => {},
  warn: () => {},
  error: () => {},
};

export function createConsoleLogger(
  level: "silent" | "info" | "verbose" = "info",
): Logger {
  if (level === "silent") return silentLogger;
  return {
    info: (msg) => console.log(`  ${msg}`),
    verbose: (msg) =>
      level === "verbose" ? console.log(`  ${msg}`) : undefined,
    warn: (msg) => console.warn(`  ⚠ ${msg}`),
    error: (msg) => console.error(`  ✗ ${msg}`),
  };
}

export interface GeneratorContext {
  ast: VaspAST;
  /** Absolute path to the staging directory (generators write here) */
  outputDir: string;
  /** Absolute path to the real project directory (for checking existing user files) */
  projectDir: string;
  /** Absolute path to the templates directory */
  templateDir: string;
  isTypeScript: boolean;
  isSsr: boolean;
  isSsg: boolean;
  isSpa: boolean;
  /** 'ssr' for both SSR and SSG modes */
  mode: "spa" | "ssr";
  ext: "js" | "ts";
  logger: Logger;
}

export function createContext(
  ast: VaspAST,
  outputDir: string,
  opts: { projectDir?: string; templateDir?: string; logger?: Logger } = {},
): GeneratorContext {
  const isTypeScript = ast.app!.typescript;
  const isSsr = ast.app!.ssr === true;
  const isSsg = ast.app!.ssr === "ssg";
  const isSpa = !isSsr && !isSsg;

  // Default template dir: two levels up from this file, then templates/
  const templateDir =
    opts.templateDir ??
    join(import.meta.dirname, "..", "..", "..", "templates");

  return {
    ast,
    outputDir,
    projectDir: opts.projectDir ?? outputDir,
    templateDir,
    isTypeScript,
    isSsr,
    isSsg,
    isSpa,
    mode: isSpa ? "spa" : "ssr",
    ext: isTypeScript ? "ts" : "js",
    logger: opts.logger ?? silentLogger,
  };
}
