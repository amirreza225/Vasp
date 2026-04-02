import type { AutoPageNode, EntityNode, FieldNode } from "@vasp-framework/core";
import { BaseGenerator } from "./BaseGenerator.js";
import type {
  AutoPageResolvedColumn,
  AutoPageResolvedField,
  TemplateExtraData,
} from "./template-data.js";

// @exhaustiveness-partial: field-type
// AutoPageGenerator maps field types to PrimeVue component flags (isBoolean,
// isEnum, isDateTime, isFile, isText, isNumber). The "String" type is the
// implicit default case — it maps to InputText, which is the fallback used
// whenever none of the other flags match.

/**
 * Generates fully functional Vue SFC pages from `autoPage` blocks,
 * powered by PrimeVue 4 components.
 *
 * Output locations:
 *  - SPA:  src/pages/<AutoPageName>.vue
 *  - SSR:  pages/<nuxt-path>.vue  (Nuxt file-based routing)
 */
export class AutoPageGenerator extends BaseGenerator {
  run(): void {
    const { ast, isSpa } = this.ctx;
    if (!ast.autoPages.length) return;

    for (const ap of ast.autoPages) {
      const entity = this.resolveEntity(ap.entity);
      if (!entity) continue; // SemanticValidator already reported this error

      const resolvedData = this.resolveAutoPageData(ap, entity);
      const templateKey = `autopages/${ap.pageType}.vue.hbs`;
      const content = this.render(templateKey, {
        autoPage: ap,
        ...resolvedData,
      });

      const outputPath = isSpa
        ? `src/pages/${ap.name}.vue`
        : this.nuxtFilePath(ap.path, ap.name);

      this.write(outputPath, content);
    }
  }

  /**
   * Builds rich, template-ready data for the Handlebars template:
   *   resolvedColumns — columns with display types and sort/filter flags
   *   resolvedFields  — form/detail fields with PrimeVue component names and flags
   */
  private resolveAutoPageData(
    ap: AutoPageNode,
    entity: EntityNode,
  ): Pick<
    TemplateExtraData,
    | "resolvedColumns"
    | "resolvedFields"
    | "entityNameCamel"
    | "entityNamePascal"
    | "layout"
    | "isTwoColumn"
    | "hasColumns"
    | "hasFields"
    | "hasSortable"
    | "hasFilterable"
    | "hasSearchable"
    | "hasRowActions"
    | "hasTopActions"
    | "hasCreate"
    | "hasExport"
    | "hasViewRow"
    | "hasEditRow"
    | "hasDeleteRow"
    | "hasPaginate"
    | "pageSize"
    | "successRoute"
    | "pageTitle"
    | "fieldCount"
  > {
    const fieldMap = new Map<string, FieldNode>(
      entity.fields.map((f) => [f.name, f]),
    );

    // ── columns for list view ─────────────────────────────────────────────
    const columnKeys = ap.columns?.length
      ? ap.columns
      : entity.fields.map((f) => f.name);

    const resolvedColumns: AutoPageResolvedColumn[] = columnKeys.map((key) => {
      const field = fieldMap.get(key);
      return {
        key,
        label: this.humanLabel(key),
        columnType: field ? this.primevueColumnTypeFor(field) : "text",
        sortable: ap.sortable?.includes(key) ?? false,
        filterable: ap.filterable?.includes(key) ?? false,
        searchable: ap.searchable?.includes(key) ?? false,
        enumOptions: field?.type === "Enum" ? (field.enumValues ?? []) : [],
      };
    });

    // ── fields for form / detail view ─────────────────────────────────────
    const fieldKeys = ap.fields?.length
      ? ap.fields
      : entity.fields
          .filter((f) => !f.modifiers?.includes("id"))
          .map((f) => f.name);

    const resolvedFields: AutoPageResolvedField[] = fieldKeys.map((key) => {
      const field = fieldMap.get(key);
      return {
        key,
        label: this.humanLabel(key),
        primevueComponent: field
          ? this.primevueComponentFor(field)
          : "InputText",
        isRequired: !(field?.nullable ?? false),
        isReadOnly: ap.pageType === "detail",
        enumOptions: field?.type === "Enum" ? (field.enumValues ?? []) : [],
        isEnum: field?.type === "Enum",
        isBoolean: field?.type === "Boolean",
        isDateTime: field?.type === "DateTime",
        isFile: field?.type === "File",
        isText: field?.type === "Text" || field?.type === "Json",
        isNumber: field?.type === "Int" || field?.type === "Float",
        columnType: field ? this.primevueColumnTypeFor(field) : "text",
        fieldType: field?.type ?? "String",
      };
    });

    const entityNameCamel =
      ap.entity.charAt(0).toLowerCase() + ap.entity.slice(1);

    return {
      resolvedColumns,
      resolvedFields,
      entityNameCamel,
      entityNamePascal: ap.entity,
      layout: ap.layout ?? "1-column",
      isTwoColumn: (ap.layout ?? "1-column") === "2-column",
      hasColumns: resolvedColumns.length > 0,
      hasFields: resolvedFields.length > 0,
      hasSortable: (ap.sortable?.length ?? 0) > 0,
      hasFilterable: (ap.filterable?.length ?? 0) > 0,
      hasSearchable: (ap.searchable?.length ?? 0) > 0,
      hasRowActions: (ap.rowActions?.length ?? 0) > 0,
      hasTopActions: (ap.topActions?.length ?? 0) > 0,
      hasCreate: ap.topActions?.includes("create") ?? false,
      hasExport: ap.topActions?.includes("export") ?? false,
      hasViewRow: ap.rowActions?.includes("view") ?? false,
      hasEditRow: ap.rowActions?.includes("edit") ?? false,
      hasDeleteRow: ap.rowActions?.includes("delete") ?? false,
      hasPaginate: ap.paginate ?? true,
      pageSize: ap.pageSize ?? 20,
      successRoute: ap.successRoute ?? "/",
      pageTitle: ap.title ?? ap.name,
      fieldCount: resolvedFields.length,
    };
  }

  /** Convert a camelCase or snake_case field name to a human-readable label */
  private humanLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
  }

  /**
   * Convert a route path like /todos/:id/edit to a Nuxt file-based path.
   *   /todos              → pages/todos/index.vue
   *   /todos/:id          → pages/todos/[id].vue
   *   /todos/:id/edit     → pages/todos/[id]/edit.vue
   */
  private nuxtFilePath(routePath: string, _apName: string): string {
    const segments = routePath.replace(/^\//, "").split("/");
    const nuxtSegments = segments.map((s) =>
      s.startsWith(":") ? `[${s.slice(1)}]` : s,
    );

    if (nuxtSegments.length === 1 && nuxtSegments[0]) {
      return `pages/${nuxtSegments[0]}/index.vue`;
    }
    const last = nuxtSegments.pop();
    return `pages/${nuxtSegments.join("/")}/${last}.vue`;
  }
}
