// Generator configuration options — passed to generate() from the CLI

import type { VaspPlugin } from "./plugin.js";

export interface GeneratorOptions {
  outputDir: string; // absolute path to the generated app root
  templateDir?: string; // override template directory (for testing)
  logLevel?: "silent" | "info" | "verbose";
  engine?: unknown; // pre-built TemplateEngine instance (avoids re-compilation)
  /**
   * Plugins contributed by the project's `vasp.config.ts` / `vasp.config.js`.
   * Each plugin may add custom generators, override built-in Handlebars templates,
   * and register custom Handlebars helpers.
   */
  plugins?: VaspPlugin[];
}

export interface GeneratorResult {
  success: boolean;
  filesWritten: string[]; // relative paths of all written files
  errors: string[];
  warnings: string[];
}
