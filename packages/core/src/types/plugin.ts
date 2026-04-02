import type { VaspAST } from "./ast.js";

/**
 * Minimal context object passed to every plugin generator.
 * Exposes read-only access to the parsed AST and output-mode flags so that
 * plugin generators can make decisions based on the app definition without
 * depending on Vasp-internal classes.
 */
export interface PluginGeneratorContext {
  /** Fully-parsed VaspAST for the current main.vasp */
  readonly ast: VaspAST;
  /**
   * Absolute path to the staging directory where files must be written.
   * Always write through the provided `write` callback — do not write here
   * directly so that the manifest and orphan-deletion logic stay consistent.
   */
  readonly outputDir: string;
  /** Absolute path to the real project output directory. */
  readonly projectDir: string;
  /** True when the app was declared with `typescript: true`. */
  readonly isTypeScript: boolean;
  /** True when the app runs as a Nuxt 4 SSR app (`ssr: true`). */
  readonly isSsr: boolean;
  /** True when the app runs as a Nuxt 4 SSG app (`ssr: "ssg"`). */
  readonly isSsg: boolean;
  /** True when the app is a Vite SPA (`ssr: false`). */
  readonly isSpa: boolean;
  /** Source-file extension for the generated app: `"ts"` or `"js"`. */
  readonly ext: "ts" | "js";
}

/**
 * Callback passed to every plugin generator's `run()` method.
 * Writes a file relative to the project root (e.g. `"src/plugins/my-plugin.ts"`).
 * Overwrites any existing file with the same path in the staging area.
 */
export type PluginWriteFn = (relativePath: string, content: string) => void;

/**
 * A single code generator contributed by a {@link VaspPlugin}.
 * Plugin generators run **after** all built-in Vasp generators have completed.
 */
export interface PluginGenerator {
  /** Unique display name used in logs and error messages. */
  name: string;
  /**
   * Execute the generator.
   * Use the `write` callback to emit files; do not write to disk directly.
   */
  run(ctx: PluginGeneratorContext, write: PluginWriteFn): void;
}

/**
 * A Vasp plugin that extends the code-generation pipeline without forking the
 * monorepo.  Place an instance (or array of instances) in `vasp.config.ts`
 * at the project root and it will be automatically loaded by `vasp generate`
 * and `vasp start`.
 *
 * @example
 * ```ts
 * // vasp.config.ts
 * import type { VaspPlugin } from "@vasp-framework/core";
 *
 * const myPlugin: VaspPlugin = {
 *   name: "my-company-plugin",
 *
 *   // 1. Additional generators run after the built-in pipeline
 *   generators: [{
 *     name: "CompanyHeaderGenerator",
 *     run(ctx, write) {
 *       write("src/company-header.ts", `export const VERSION = "${ctx.ast.app?.title}";`);
 *     },
 *   }],
 *
 *   // 2. Override any built-in Handlebars template
 *   templateOverrides: {
 *     "shared/server/index.hbs": `// custom server entry\n{{appName}}`,
 *   },
 *
 *   // 3. Register custom Handlebars helpers usable in all templates
 *   helpers: {
 *     shout: (str: string) => str.toUpperCase() + "!!!",
 *   },
 * };
 *
 * export default { plugins: [myPlugin] };
 * ```
 */
export interface VaspPlugin {
  /** Unique name used in logs and error messages. */
  name: string;

  /**
   * Additional generators that run **after** all built-in Vasp generators.
   * Each generator receives a read-only context and a write callback.
   */
  generators?: PluginGenerator[];

  /**
   * Override or extend built-in Handlebars templates.
   * Keys are template paths relative to the `templates/` root
   * (e.g. `"shared/server/index.hbs"`).
   * Values are raw `.hbs` source strings.
   * Plugin overrides are applied after the built-in template directory is
   * loaded, so they take precedence over the built-in templates.
   */
  templateOverrides?: Record<string, string>;

  /**
   * Custom Handlebars helpers registered before any template is rendered.
   * Keys become the helper name (e.g. `"shout"` → `{{shout name}}`).
   * Values are plain functions; the trailing Handlebars options object is
   * automatically stripped before your function is called.
   */
  helpers?: Record<string, (...args: unknown[]) => unknown>;
}

/**
 * Shape of the optional `vasp.config.ts` / `vasp.config.js` file that can be
 * placed at the project root to register plugins.
 */
export interface VaspConfig {
  /** Plugins to apply during code generation. */
  plugins?: VaspPlugin[];
}
