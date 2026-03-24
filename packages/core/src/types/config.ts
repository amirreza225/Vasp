// Generator configuration options — passed to generate() from the CLI

export interface GeneratorOptions {
  outputDir: string         // absolute path to the generated app root
  templateDir?: string      // override template directory (for testing)
  logLevel?: 'silent' | 'info' | 'verbose'
}

export interface GeneratorResult {
  success: boolean
  filesWritten: string[]    // relative paths of all written files
  errors: string[]
  warnings: string[]
}
