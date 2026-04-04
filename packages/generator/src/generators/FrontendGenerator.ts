import {
  DEFAULT_BACKEND_PORT,
  DEFAULT_SPA_PORT,
  DEFAULT_SSR_PORT,
} from "@vasp-framework/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BaseGenerator } from "./BaseGenerator.js";

export class FrontendGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info(
      `Generating frontend (${this.ctx.mode} / ${this.ctx.ext})...`,
    );

    if (this.ctx.isSpa) {
      this.generateSpa();
    } else {
      this.generateSsr();
    }
  }

  private generateSpa(): void {
    const { ext, ast } = this.ctx;
    const data = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: DEFAULT_SPA_PORT,
    };

    // Static files
    this.write(`index.html`, this.render(`spa/${ext}/index.html.hbs`));
    this.write(
      `vite.config.${ext}`,
      this.render(`spa/${ext}/vite.config.${ext}.hbs`, data),
    );

    // Vue app entry
    this.write(
      `src/main.${ext}`,
      this.render(`spa/${ext}/src/main.${ext}.hbs`),
    );
    this.write(`src/App.vue`, this.render(`spa/${ext}/src/App.vue.hbs`));
    this.write(
      `src/components/VaspErrorBoundary.vue`,
      this.render(`spa/${ext}/src/components/VaspErrorBoundary.vue.hbs`),
    );
    this.write(
      `src/components/VaspNotifications.vue`,
      this.render(`spa/${ext}/src/components/VaspNotifications.vue.hbs`),
    );
    this.write(
      `src/vasp/useVaspNotifications.${ext}`,
      this.render(`spa/${ext}/src/vasp/useVaspNotifications.${ext}.hbs`),
    );

    // Router — build page component source map
    const pagesMap = this.buildPagesMap();
    this.write(
      `src/router/index.${ext}`,
      this.render(`spa/${ext}/src/router/index.${ext}.hbs`, { pagesMap }),
    );

    // Vasp plugin
    this.write(
      `src/vasp/plugin.${ext}`,
      this.render(`spa/${ext}/src/vasp/plugin.${ext}.hbs`),
    );

    // Client SDK
    this.write(
      `src/vasp/client/index.${ext}`,
      this.render(`spa/${ext}/src/vasp/client/index.${ext}.hbs`, {
        // hasClientTypes controls whether 'export type * from ./types.js' is emitted.
        // types.ts is only generated when there are entities, queries, actions, or cruds.
        hasClientTypes:
          this.ctx.isTypeScript &&
          (ast.queries.length > 0 ||
            ast.actions.length > 0 ||
            ast.cruds.length > 0 ||
            ast.entities.length > 0),
      }),
    );
    if (ast.queries.length > 0) {
      this.write(
        `src/vasp/client/queries.${ext}`,
        this.render(`spa/${ext}/src/vasp/client/queries.${ext}.hbs`),
      );
    }
    if (ast.actions.length > 0) {
      this.write(
        `src/vasp/client/actions.${ext}`,
        this.render(`spa/${ext}/src/vasp/client/actions.${ext}.hbs`),
      );
    }

    // TS-only: generate types.ts from entity schema + query/action signatures
    if (this.ctx.isTypeScript) {
      this.write(
        `src/vite-env.d.ts`,
        this.render(`spa/ts/src/vite-env.d.ts.hbs`),
      );
    }
    if (
      this.ctx.isTypeScript &&
      (ast.queries.length > 0 ||
        ast.actions.length > 0 ||
        ast.cruds.length > 0 ||
        ast.entities.length > 0)
    ) {
      this.write(
        `src/vasp/client/types.ts`,
        this.render(`spa/ts/src/vasp/client/types.ts.hbs`, {
          entities: ast.entities,
        }),
      );
    }

    // Scaffold empty page files if they don't exist
    for (const page of ast.pages) {
      const comp = page.component;
      const src = comp.source;
      const relativePath = src.replace("@src/", "src/");
      const fullPath = join(this.ctx.projectDir, relativePath);
      if (!existsSync(fullPath)) {
        const pageName =
          comp.kind === "default" ? comp.defaultExport : comp.namedExport;
        this.write(relativePath, this.scaffoldVuePage(pageName));
      }
    }

    // Warn if auth is enabled and no route has `protected: false` in SPA mode.
    if (ast.auth && ast.routes.length > 0) {
      const hasPublicRoute = ast.routes.some((r) => r.protected === false);
      if (!hasPublicRoute) {
        this.ctx.logger.warn(
          "All declared routes are auth-protected. Add `protected: false` to routes that should be publicly accessible (e.g. landing page).",
        );
      }
    }
  }

  private generateSsr(): void {
    const { ext, ast } = this.ctx;
    const backendPort = DEFAULT_BACKEND_PORT;
    const frontendPort = DEFAULT_SSR_PORT;
    const data = { backendPort, frontendPort };

    // Nuxt config
    this.write(
      `nuxt.config.${ext}`,
      this.render(`ssr/${ext}/nuxt.config.${ext}.hbs`, data),
    );

    // Root app component
    this.write(`app.vue`, this.render(`ssr/${ext}/app.vue.hbs`));
    this.write(`error.vue`, this.render(`ssr/${ext}/error.vue.hbs`));

    // Universal HTTP plugin — replaces the old server/client split plugins.
    // Both SSR render and client-side hydration call the Elysia backend over HTTP,
    // forwarding cookies server-side via useRequestHeaders for session continuity.
    this.write(
      `plugins/vasp.${ext}`,
      this.render(`ssr/${ext}/plugins/vasp.${ext}.hbs`),
    );

    // Composables
    this.write(
      `composables/useVasp.${ext}`,
      this.render(`ssr/${ext}/composables/useVasp.${ext}.hbs`),
    );

    // Typed CRUD composables — auto-imported by Nuxt, parallel to the SPA's crud.ts
    if (ast.cruds.length > 0) {
      this.write(
        `composables/crud.${ext}`,
        this.render(`ssr/${ext}/composables/crud.${ext}.hbs`),
      );
    }

    // Auth composable + middleware (only when auth block present)
    if (ast.auth) {
      this.write(
        `composables/useAuth.${ext}`,
        this.render(`ssr/${ext}/composables/useAuth.${ext}.hbs`),
      );
      this.write(
        `middleware/auth.${ext}`,
        this.render(`ssr/${ext}/middleware/auth.${ext}.hbs`),
      );
    }

    // Default layout with navigation bar and dark mode toggle.
    // Build nav routes: public routes (not /login, /register) shown in the nav bar.
    const navRoutes = ast.routes
      .filter((r) => r.path !== "/login" && r.path !== "/register")
      .map((r) => ({
        label: this.routeLabel(r.path, r.name),
        path: r.path,
      }));
    const darkModeSelector = ast.app?.ui?.darkModeSelector ?? ".app-dark";
    const darkModeClass = darkModeSelector.replace(/^\./, "");
    const appTitle = ast.app?.title ?? ast.app?.name ?? "Vasp App";
    this.write(
      `layouts/default.vue`,
      this.render(`ssr/${ext}/layouts/default.vue.hbs`, {
        navRoutes,
        darkModeSelector,
        darkModeClass,
        appTitle,
        hasAuth: !!ast.auth,
      }),
    );

    // Generate Nuxt pages from Vasp routes.
    // Routes are protected by default when an auth block exists unless explicitly
    // overridden with `protected: false` in the route DSL block.
    const pagesMap = this.buildPagesMap();
    // Warn if auth is enabled and no route has `protected: false`.
    // This is a common footgun: every declared route (including the landing page)
    // is protected by default. Add `protected: false` to public routes.
    if (ast.auth && ast.routes.length > 0) {
      const hasPublicRoute = ast.routes.some((r) => r.protected === false);
      if (!hasPublicRoute) {
        this.ctx.logger.warn(
          "All declared routes are auth-protected. Add `protected: false` to routes that should be publicly accessible (e.g. landing page).",
        );
      }
    }

    for (const route of ast.routes) {
      const pageFile = this.routePathToNuxtFile(route.path);
      const componentSource = pagesMap[route.to];
      if (!componentSource) continue;
      const componentName = this.extractComponentName(componentSource);
      // A route is protected when auth exists AND the route's `protected` field is not explicitly false.
      // Default-on: any route in an app with an auth block is protected unless the author writes
      // `protected: false` in the route DSL block. Login/register pages bypass this via isProtected: false.
      const isProtected = !!ast.auth && route.protected !== false;
      this.write(
        `pages/${pageFile}`,
        this.render(`ssr/${ext}/_page.vue.hbs`, {
          componentName,
          componentSource,
          isProtected,
        }),
      );
    }

    // Auth login/register pages — always public, use no layout (full-screen centered card design)
    if (ast.auth) {
      this.write(
        `pages/login.vue`,
        this.render(`ssr/${ext}/_page.vue.hbs`, {
          componentName: "LoginPage",
          componentSource: "@src/pages/Login.vue",
          isProtected: false,
          noLayout: true,
        }),
      );
      this.write(
        `pages/register.vue`,
        this.render(`ssr/${ext}/_page.vue.hbs`, {
          componentName: "RegisterPage",
          componentSource: "@src/pages/Register.vue",
          isProtected: false,
          noLayout: true,
        }),
      );
    }

    // Scaffold empty src/pages/ component files if they don't exist
    for (const page of ast.pages) {
      const comp = page.component;
      const src = comp.source;
      const relativePath = src.replace("@src/", "src/");
      const fullPath = join(this.ctx.projectDir, relativePath);
      if (!existsSync(fullPath)) {
        const pageName =
          comp.kind === "default" ? comp.defaultExport : comp.namedExport;
        this.write(relativePath, this.scaffoldVuePage(pageName));
      }
    }
  }

  /** Converts a Vasp route path to a Nuxt pages/ file name.
   *  "/" → "index.vue", "/about" → "about/index.vue", "/users/:id" → "users/[id]/index.vue"
   *
   * Index files are used instead of flat files (e.g. "about.vue") to prevent Nuxt from
   * treating the page as a parent layout for sibling autoPage routes.  In Nuxt 4, when
   * both "todos.vue" and a "todos/" directory exist, "todos.vue" is promoted to a parent
   * layout and its middleware runs for ALL /todos/* routes — including auto-generated
   * autoPage children that have no auth declaration.  Using "todos/index.vue" keeps the
   * pages independent: the auth middleware on /todos does not cascade to /todos/create. */
  private routePathToNuxtFile(path: string): string {
    if (path === "/") return "index.vue";
    // Replace Express-style :param with Nuxt [param]
    const normalized = path.replace(/^\//, "").replace(/:([^/]+)/g, "[$1]");
    return `${normalized}/index.vue`;
  }

  private buildPagesMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const page of this.ctx.ast.pages) {
      map[page.name] = page.component.source;
    }
    return map;
  }

  private extractComponentName(source: string): string {
    // "@src/pages/Home.vue" → "Home"
    const basename = source.split("/").pop() ?? source;
    return basename.replace(/\.vue$/, "");
  }

  /** Convert a route path and name to a human-readable nav label.
   *  "/todos" → "Todos", "/user-profile" → "User Profile", "/" → "Home" */
  private routeLabel(path: string, name: string): string {
    if (path === "/") return "Home";
    // Try to derive from path segment first for readability
    const last = path.split("/").filter(Boolean).pop() ?? name;
    return last
      .replace(/-/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
  }

  private scaffoldVuePage(name: string): string {
    return `<template>
  <div>
    <h1>${name}</h1>
    <p>Edit this page in src/pages/</p>
  </div>
</template>
`;
  }
}
