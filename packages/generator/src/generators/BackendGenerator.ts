import {
  DEFAULT_BACKEND_PORT,
  DEFAULT_SPA_PORT,
  DEFAULT_SSR_PORT,
  VASP_VERSION,
} from "@vasp-framework/core";
import { BaseGenerator } from "./BaseGenerator.js";

export class BackendGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info("Generating Elysia backend...");

    const middlewares = this.ctx.ast.middlewares.map((middleware) => ({
      ...middleware,
      fnSource: this.resolveServerImport(middleware.fn.source, "server/"),
      importAlias: `${this.camel(middleware.name)}Middleware`,
    }));
    const userEnv = this.ctx.ast.app!.env ?? {};
    const envVars = Object.entries(userEnv).map(([name, def]) => ({
      name,
      requirement: def.requirement,
      type: def.type,
      enumValues: def.enumValues ?? null,
      defaultValue: def.defaultValue ?? null,
      validation: def.validation ?? null,
    }));

    // DATABASE_URL is required by every generated app (Drizzle always uses Postgres).
    // Auto-inject it so the server refuses to start without a connection string,
    // even if the user forgot to declare it in their app.env block.
    if (!userEnv["DATABASE_URL"]) {
      envVars.push({
        name: "DATABASE_URL",
        requirement: "required",
        type: "String",
        enumValues: null,
        defaultValue: null,
        validation: null,
      });
    }

    // When an auth block is present, JWT_SECRET must be validated at startup.
    // Automatically inject it as a required String with a minimum length of 64
    // so the server refuses to start with a missing or trivially short secret —
    // even if the user forgot to declare it in their app.env block.
    if (this.ctx.ast.auth && !userEnv["JWT_SECRET"]) {
      envVars.push({
        name: "JWT_SECRET",
        requirement: "required",
        type: "String",
        enumValues: null,
        defaultValue: null,
        validation: { minLength: 64 },
      });
    }

    // When Google OAuth is enabled, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
    // are required. Auto-inject them so the server refuses to start without them.
    const authMethods = this.ctx.ast.auth?.methods ?? [];
    if (authMethods.includes("google")) {
      if (!userEnv["GOOGLE_CLIENT_ID"]) {
        envVars.push({
          name: "GOOGLE_CLIENT_ID",
          requirement: "required",
          type: "String",
          enumValues: null,
          defaultValue: null,
          validation: null,
        });
      }
      if (!userEnv["GOOGLE_CLIENT_SECRET"]) {
        envVars.push({
          name: "GOOGLE_CLIENT_SECRET",
          requirement: "required",
          type: "String",
          enumValues: null,
          defaultValue: null,
          validation: null,
        });
      }
    }

    // When GitHub OAuth is enabled, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
    // are required. Auto-inject them so the server refuses to start without them.
    if (authMethods.includes("github")) {
      if (!userEnv["GITHUB_CLIENT_ID"]) {
        envVars.push({
          name: "GITHUB_CLIENT_ID",
          requirement: "required",
          type: "String",
          enumValues: null,
          defaultValue: null,
          validation: null,
        });
      }
      if (!userEnv["GITHUB_CLIENT_SECRET"]) {
        envVars.push({
          name: "GITHUB_CLIENT_SECRET",
          requirement: "required",
          type: "String",
          enumValues: null,
          defaultValue: null,
          validation: null,
        });
      }
    }

    const data = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: this.ctx.isSpa ? DEFAULT_SPA_PORT : DEFAULT_SSR_PORT,
      vaspVersion: VASP_VERSION,
      middlewares,
      envVars,
    };

    this.write(
      `server/index.${this.ctx.ext}`,
      this.render("shared/server/index.hbs", data),
    );
    this.write(
      `server/db/client.${this.ctx.ext}`,
      this.render("shared/server/db/client.hbs", data),
    );
    this.write(
      `server/middleware/rateLimit.${this.ctx.ext}`,
      this.render("shared/server/middleware/rateLimit.hbs", data),
    );
    this.write(
      `server/middleware/errorHandler.${this.ctx.ext}`,
      this.render("shared/server/middleware/errorHandler.hbs", data),
    );
    this.write(
      `server/middleware/logger.${this.ctx.ext}`,
      this.render("shared/server/middleware/logger.hbs", data),
    );
    this.write(
      `server/routes/_vasp.${this.ctx.ext}`,
      this.render("shared/server/routes/_vasp.hbs", data),
    );

    if (this.ctx.isSsr || this.ctx.isSsg) {
      this.write(
        `server/middleware/csrf.${this.ctx.ext}`,
        this.render("shared/server/middleware/csrf.hbs", data),
      );
      if (this.ctx.isTypeScript) {
        this.write(
          `server/tsconfig.json`,
          this.render("shared/server/tsconfig.server.json.hbs", data),
        );
      }
    }
  }

  private camel(str: string): string {
    return str
      .replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
      .replace(/^./, (c) => c.toLowerCase());
  }
}
