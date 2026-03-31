// Phase 2: Generator public API
export { generate, detectDestructiveSchemaChanges } from "./generate.js";
export type { GeneratorContext } from "./GeneratorContext.js";
export { Manifest, computeHash } from "./manifest/Manifest.js";
export type { ManifestData, ManifestEntry, SchemaSnapshot, EntitySnapshot, FieldSnapshot } from "./manifest/Manifest.js";
export { isPlaceholderValue, parseEnvFile } from "./utils/fs.js";
