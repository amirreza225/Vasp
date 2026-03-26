import { parse } from "@vasp-framework/parser";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "./generate.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { TEMPLATES_DIR, MINIMAL_VASP } from "./test-helpers.js";

const TMP_DIR = join(import.meta.dirname, "__test_output__", "email");

// Shared engine instance — avoids creating a separate Handlebars environment
// and compiling ~97 templates per test (the main cause of OOM in CI).
let sharedEngine: TemplateEngine;
beforeAll(() => {
  sharedEngine = new TemplateEngine();
  sharedEngine.loadDirectory(TEMPLATES_DIR);
});

describe("EmailGenerator", () => {
  // ── Email generation ────────────────────────────────────────────────────

  it("generates a resend mailer file when an email block is declared", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
        templates: {
          welcome: import { welcomeTemplate } from "@src/emails/welcome.js"
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-resend");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/email/mailer.js"))).toBe(true);
    const mailer = readFileSync(
      join(outputDir, "server/email/mailer.js"),
      "utf8",
    );
    expect(mailer).toContain("from 'resend'");
    expect(mailer).toContain("new Resend(process.env.RESEND_API_KEY)");
    expect(mailer).toContain("FROM_ADDRESS = 'noreply@myapp.com'");
    expect(mailer).toContain("welcomeTemplate");
    expect(mailer).toContain("export async function sendEmail");
    expect(mailer).toContain("_client.emails.send");
  });

  it("generates a sendgrid mailer file with correct adapter", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      email SgMailer {
        provider: sendgrid
        from: "hello@example.com"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-sendgrid");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/email/sgMailer.js"))).toBe(true);
    const mailer = readFileSync(
      join(outputDir, "server/email/sgMailer.js"),
      "utf8",
    );
    expect(mailer).toContain("from '@sendgrid/mail'");
    expect(mailer).toContain("sgMail.setApiKey");
    expect(mailer).toContain("sgMail.send");
    expect(mailer).toContain("FROM_ADDRESS = 'hello@example.com'");
  });

  it("generates an smtp mailer file with nodemailer transport", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      email SmtpMailer {
        provider: smtp
        from: "noreply@myapp.com"
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-smtp");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/email/smtpMailer.js"))).toBe(
      true,
    );
    const mailer = readFileSync(
      join(outputDir, "server/email/smtpMailer.js"),
      "utf8",
    );
    expect(mailer).toContain("from 'nodemailer'");
    expect(mailer).toContain("nodemailer.createTransport");
    expect(mailer).toContain("SMTP_HOST");
    expect(mailer).toContain("_transporter.sendMail");
  });

  it("package.json includes resend dependency when email provider is resend", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      email Mailer { provider: resend from: "noreply@myapp.com" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-pkg-resend");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const pkg = JSON.parse(
      readFileSync(join(outputDir, "package.json"), "utf8"),
    );
    expect(pkg.dependencies).toHaveProperty("resend");
    expect(pkg.dependencies).not.toHaveProperty("@sendgrid/mail");
    expect(pkg.dependencies).not.toHaveProperty("nodemailer");
  });

  it("package.json includes @sendgrid/mail when provider is sendgrid", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      email Mailer { provider: sendgrid from: "noreply@myapp.com" }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-pkg-sg");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const pkg = JSON.parse(
      readFileSync(join(outputDir, "package.json"), "utf8"),
    );
    expect(pkg.dependencies).toHaveProperty("@sendgrid/mail");
    expect(pkg.dependencies).not.toHaveProperty("resend");
  });

  it("action route imports sendEmail and template fn when onSuccess.sendEmail is set", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      email Mailer {
        provider: resend
        from: "noreply@myapp.com"
        templates: {
          welcome: import { welcomeTemplate } from "@src/emails/welcome.js"
        }
      }
      action registerUser {
        fn: import { registerUser } from "@src/actions.js"
        entities: []
        onSuccess: {
          sendEmail: welcome
        }
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-action-on-success");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/actions/registerUser.js"),
      "utf8",
    );
    expect(route).toContain("welcomeTemplate");
    expect(route).toContain("sendEmail");
    expect(route).toContain("await sendEmail(welcomeTemplate, result)");
  });

  it("action route does NOT import sendEmail when no onSuccess", () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: []
      }
    `;
    const ast = parse(source);
    const outputDir = join(TMP_DIR, "email-action-no-success");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    const route = readFileSync(
      join(outputDir, "server/routes/actions/createTodo.js"),
      "utf8",
    );
    expect(route).not.toContain("sendEmail");
  });

  it("skips email generation when no email blocks are present", () => {
    const ast = parse(MINIMAL_VASP);
    const outputDir = join(TMP_DIR, "email-none");
    generate(ast, {
      outputDir,
      templateDir: TEMPLATES_DIR,
      logLevel: "silent",
      engine: sharedEngine,
    });

    expect(existsSync(join(outputDir, "server/email"))).toBe(false);
  });
});
