import { GeneratorError } from '@vasp/core'
import Handlebars from 'handlebars'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'

type TemplateDelegate = HandlebarsTemplateDelegate<unknown>

export class TemplateEngine {
  private readonly cache = new Map<string, TemplateDelegate>()
  private readonly hbs: typeof Handlebars

  constructor() {
    this.hbs = Handlebars.create()
    this.registerHelpers()
  }

  /**
   * Pre-compile all .hbs files found under a directory tree.
   * Call this once per generation run to warm the cache.
   */
  loadDirectory(dir: string): void {
    this.walkHbs(dir, (filePath) => {
      const key = relative(dir, filePath)
      const source = readFileSync(filePath, 'utf8')
      try {
        this.cache.set(key, this.hbs.compile(source))
      } catch (err) {
        throw new GeneratorError(`Failed to compile template ${key}: ${String(err)}`, 'TemplateEngine')
      }
    })
  }

  /**
   * Render a template by its key (relative path from the template root).
   */
  render(key: string, data: Record<string, unknown>): string {
    const tmpl = this.cache.get(key)
    if (!tmpl) {
      throw new GeneratorError(`Template not found: '${key}'`, 'TemplateEngine')
    }
    return tmpl(data)
  }

  /**
   * Render an inline Handlebars string (used for testing helpers).
   */
  renderString(source: string, data: Record<string, unknown>): string {
    return this.hbs.compile(source)(data)
  }

  /**
   * Returns true if a template key exists in the cache.
   */
  has(key: string): boolean {
    return this.cache.has(key)
  }

  /** All loaded template keys */
  keys(): string[] {
    return [...this.cache.keys()]
  }

  // ---- Helpers ----

  private registerHelpers(): void {
    this.hbs.registerHelper('camelCase', (str: string) => toCamelCase(str))
    this.hbs.registerHelper('pascalCase', (str: string) => toPascalCase(str))
    this.hbs.registerHelper('kebabCase', (str: string) => toKebabCase(str))
    this.hbs.registerHelper('lowerCase', (str: string) => str.toLowerCase())
    this.hbs.registerHelper('upperCase', (str: string) => str.toUpperCase())

    this.hbs.registerHelper('join', (arr: string[], sep: string) => {
      if (!Array.isArray(arr)) return ''
      return arr.join(typeof sep === 'string' ? sep : ', ')
    })

    /** Rewrites @src/foo.js → @src/foo.ts when isTypeScript is true */
    this.hbs.registerHelper('importPath', (source: string, ext: string) => {
      if (ext === 'ts' && source.endsWith('.js')) {
        return source.slice(0, -3) + '.ts'
      }
      return source
    })

    /** eq helper for {{#if (eq a b)}} */
    this.hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b)

    /** includes helper: {{#if (includes arr item)}} */
    this.hbs.registerHelper('includes', (arr: unknown[], item: unknown) =>
      Array.isArray(arr) && arr.includes(item),
    )

    /** importName: extracts the exported name from an ImportExpression */
    this.hbs.registerHelper('importName', (imp: { kind: string; defaultExport?: string; namedExport?: string }) => {
      return imp.kind === 'default' ? (imp.defaultExport ?? '') : (imp.namedExport ?? '')
    })
  }

  private walkHbs(dir: string, fn: (path: string) => void): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return // directory doesn't exist yet — skip silently
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        this.walkHbs(full, fn)
      } else if (extname(full) === '.hbs') {
        fn(full)
      }
    }
  }
}

// ---- String transform utilities ----

export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase())
}

export function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/^-/, '')
}
