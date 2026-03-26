import { parse } from "@vasp-framework/parser";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR } from "./test-helpers.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "storage");

// Shared engine instance — avoids creating a separate Handlebars environment
// and compiling ~97 templates per test (the main cause of OOM in CI).
let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

describe("StorageGenerator", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = join(TMP_DIR, `storage-gen-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
  });

  const BASE_APP = `
app StorageApp {
  title: "Storage App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`;

  const LOCAL_STORAGE_VASP = `${BASE_APP}
storage Files {
  provider: local
  maxSize: "10mb"
  allowedTypes: ["image/*", "application/pdf"]
  publicPath: "/uploads"
}
`;

  const S3_STORAGE_VASP = `${BASE_APP}
storage Assets {
  provider: s3
  bucket: "my-assets"
  maxSize: "50mb"
  allowedTypes: ["image/*"]
  publicPath: "/media"
}
`;

  const CLOUD_TS_VASP = `
app CloudTsApp {
  title: "Cloud TS App"
  db: Drizzle
  ssr: false
  typescript: true
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

storage Photos {
  provider: r2
  bucket: "photos-bucket"
  maxSize: "20mb"
  allowedTypes: ["image/*"]
}
`;

  it("generates local storage provider module", () => {
    const ast = parse(LOCAL_STORAGE_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const providerPath = join(outputDir, "server/storage/files.js");
    expect(existsSync(providerPath)).toBe(true);
    const content = readFileSync(providerPath, "utf8");
    expect(content).toContain("MAX_BYTES");
    expect(content).toContain("parseMaxSize");
    expect(content).toContain("saveFile");
    expect(content).toContain("isMimeAllowed");
    expect(content).toContain("ALLOWED_TYPES");
    expect(content).toContain("/uploads");
  });

  it("generates local storage upload route", () => {
    const ast = parse(LOCAL_STORAGE_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const routePath = join(outputDir, "server/routes/storage/files.js");
    expect(existsSync(routePath)).toBe(true);
    const content = readFileSync(routePath, "utf8");
    expect(content).toContain("filesUploadRoutes");
    expect(content).toContain("/api/storage/files");
    expect(content).toContain("/upload");
    expect(content).toContain("10mb");
    expect(content).toContain("isMimeAllowed");
  });

  it("local upload route does NOT include presign endpoint", () => {
    const ast = parse(LOCAL_STORAGE_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const routePath = join(outputDir, "server/routes/storage/files.js");
    const content = readFileSync(routePath, "utf8");
    expect(content).not.toContain("presign");
    expect(content).not.toContain("getPresignedUploadUrl");
  });

  it("generates s3 storage provider module with presigned URL support", () => {
    const ast = parse(S3_STORAGE_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const providerPath = join(outputDir, "server/storage/assets.js");
    expect(existsSync(providerPath)).toBe(true);
    const content = readFileSync(providerPath, "utf8");
    expect(content).toContain("S3Client");
    expect(content).toContain("getPresignedUploadUrl");
    expect(content).toContain("PutObjectCommand");
    expect(content).toContain("my-assets");
  });

  it("generates s3 upload route with presign endpoint", () => {
    const ast = parse(S3_STORAGE_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const routePath = join(outputDir, "server/routes/storage/assets.js");
    expect(existsSync(routePath)).toBe(true);
    const content = readFileSync(routePath, "utf8");
    expect(content).toContain("assetsUploadRoutes");
    expect(content).toContain("/api/storage/assets");
    expect(content).toContain("/presign");
    expect(content).toContain("getPresignedUploadUrl");
  });

  it("generates TypeScript storage files with .ts extension", () => {
    const ast = parse(CLOUD_TS_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "server/storage/photos.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "server/routes/storage/photos.ts"))).toBe(
      true,
    );
  });

  it("server/index.js imports storage upload routes", () => {
    const ast = parse(LOCAL_STORAGE_VASP);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    const index = readFileSync(join(outputDir, "server/index.js"), "utf8");
    expect(index).toContain("filesUploadRoutes");
    expect(index).toContain("routes/storage/files");
    expect(index).toContain(".use(filesUploadRoutes)");
  });

  it("skips storage generation when no storage blocks present", () => {
    const ast = parse(`
      app MinApp { title: "Min" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `);
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });
    expect(existsSync(join(outputDir, "server/storage"))).toBe(false);
    expect(existsSync(join(outputDir, "server/routes/storage"))).toBe(false);
    const index = readFileSync(join(outputDir, "server/index.js"), "utf8");
    expect(index).not.toContain("UploadRoutes");
  });
});
