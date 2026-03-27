import { BaseGenerator } from "./BaseGenerator.js";
import { toCamelCase, toPascalCase } from "../template/TemplateEngine.js";

export class CrudGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx;
    if (ast.cruds.length === 0) return;

    this.ctx.logger.info("Generating CRUD endpoints...");

    // Build a map from "Entity:operation" → list of {camelStore, key} to invalidate
    type InvalidationEntry = {
      store: string;
      camelStore: string;
      pascalStore: string;
      key: string;
    };
    const invalidationMap = new Map<string, InvalidationEntry[]>();
    for (const query of ast.queries) {
      if (!query.cache) continue;
      const camelStore = toCamelCase(query.cache.store);
      const pascalStore = toPascalCase(query.cache.store);
      const key = query.cache.key ?? toCamelCase(query.name);
      for (const entry of query.cache.invalidateOn ?? []) {
        if (!invalidationMap.has(entry)) invalidationMap.set(entry, []);
        invalidationMap.get(entry)!.push({
          store: query.cache.store,
          camelStore,
          pascalStore,
          key,
        });
      }
    }

    // Build a map of entity → realtime block name for auto-publish
    const realtimeByEntity = new Map(
      ast.realtimes.map((rt) => [rt.entity, rt.name]),
    );

    // Build a map of entity → outbound webhook blocks for auto-dispatch
    const webhooksByEntity = new Map<
      string,
      { name: string; events: string[] }[]
    >();
    for (const wh of ast.webhooks ?? []) {
      if (wh.mode === "outbound" && wh.entity) {
        const list = webhooksByEntity.get(wh.entity) ?? [];
        list.push({ name: wh.name, events: wh.events ?? [] });
        webhooksByEntity.set(wh.entity, list);
      }
    }

    // Build entity map for relation resolution
    const entityMap = new Map(ast.entities.map((e) => [e.name, e]));

    for (const crud of ast.cruds) {
      const realtimeName = realtimeByEntity.get(crud.entity);
      const entity = entityMap.get(crud.entity);

      // Multi-tenancy config for row-level isolation
      const mt = ast.app.multiTenant;
      const isRowLevelTenant = mt?.strategy === "row-level";
      const tenantField = isRowLevelTenant ? (mt?.tenantField ?? "") : "";
      const tenantEntity = isRowLevelTenant ? (mt?.tenantEntity ?? "") : "";
      // Skip tenant injection for the tenant entity itself
      const applyTenantFilter =
        isRowLevelTenant && !!tenantField && crud.entity !== tenantEntity;

      // Determine many-to-one relations for auto-join (with: {})
      const withRelations = (entity?.fields ?? [])
        .filter((f) => f.isRelation && !f.isArray)
        .map((f) => ({
          name: f.name,
          relatedEntity: f.relatedEntity,
          relatedTable: `${toCamelCase(f.relatedEntity!)}s`,
        }));

      const hasRelations = withRelations.length > 0;
      const listConfig = crud.listConfig;
      const paginate = listConfig?.paginate ?? false;
      const sortableFields = listConfig?.sortable ?? [];
      const filterableFields = listConfig?.filterable ?? [];
      const searchFields = listConfig?.search ?? [];
      const hasSortable = sortableFields.length > 0;
      const hasFilterable = filterableFields.length > 0;
      const hasSearch = searchFields.length > 0;
      const hasListConfig = !!listConfig;

      // Per-operation permission names (empty string = no permission required)
      const crudPerms = crud.permissions ?? {};
      const hasPermissions = Object.keys(crudPerms).length > 0;
      const listPermission = crudPerms["list"] ?? "";
      const createPermission = crudPerms["create"] ?? "";
      const updatePermission = crudPerms["update"] ?? "";
      const deletePermission = crudPerms["delete"] ?? "";

      // requireAuth is needed when auth is globally configured OR when tenant filtering is on
      const needsAuth = !!ast.auth || applyTenantFilter;

      // Collect unique cache stores needed for invalidation for this entity's CRUD ops
      type CacheImport = {
        store: string;
        camelStore: string;
        pascalStore: string;
      };
      const cacheImportMap = new Map<string, CacheImport>();
      const createCacheInvalidations: {
        camelStore: string;
        pascalStore: string;
        key: string;
      }[] = [];
      const updateCacheInvalidations: {
        camelStore: string;
        pascalStore: string;
        key: string;
      }[] = [];
      const deleteCacheInvalidations: {
        camelStore: string;
        pascalStore: string;
        key: string;
      }[] = [];

      for (const op of ["create", "update", "delete"] as const) {
        const mapKey = `${crud.entity}:${op}`;
        for (const inv of invalidationMap.get(mapKey) ?? []) {
          if (!cacheImportMap.has(inv.camelStore)) {
            cacheImportMap.set(inv.camelStore, {
              store: inv.store,
              camelStore: inv.camelStore,
              pascalStore: inv.pascalStore,
            });
          }
          const entry = {
            camelStore: inv.camelStore,
            pascalStore: inv.pascalStore,
            key: inv.key,
          };
          if (op === "create") createCacheInvalidations.push(entry);
          else if (op === "update") updateCacheInvalidations.push(entry);
          else deleteCacheInvalidations.push(entry);
        }
      }

      const cacheImports = [...cacheImportMap.values()];
      const hasCacheInvalidation = cacheImports.length > 0;

      // Outbound webhook dispatchers for this entity
      const entityWebhooks = webhooksByEntity.get(crud.entity) ?? [];
      const hasOutboundWebhooks = entityWebhooks.length > 0;
      const outboundWebhookDispatchers = entityWebhooks.map((wh) => ({
        name: wh.name,
        camelName: toCamelCase(wh.name),
        pascalName: toPascalCase(wh.name),
        hasCreated: wh.events.includes("created"),
        hasUpdated: wh.events.includes("updated"),
        hasDeleted: wh.events.includes("deleted"),
      }));

      this.write(
        `server/routes/crud/${toCamelCase(crud.entity)}.${ext}`,
        this.render("shared/server/routes/crud/_crud.hbs", {
          entity: crud.entity,
          operations: crud.operations,
          hasRealtime: !!realtimeName,
          realtimeName: realtimeName ?? "",
          hasRelations,
          withRelations,
          hasListConfig,
          paginate,
          sortableFields,
          filterableFields,
          searchFields,
          hasSortable,
          hasFilterable,
          hasSearch,
          hasPermissions,
          listPermission,
          createPermission,
          updatePermission,
          deletePermission,
          needsAuth,
          applyTenantFilter,
          tenantField,
          hasCacheInvalidation,
          cacheImports,
          createCacheInvalidations,
          updateCacheInvalidations,
          deleteCacheInvalidations,
          hasOutboundWebhooks,
          outboundWebhookDispatchers,
        }),
      );
    }

    // Client SDK: crud helpers — SPA only (SSR uses $vasp composable via dual-transport plugin)
    if (this.ctx.isSpa) {
      this.write(
        `src/vasp/client/crud.${ext}`,
        this.render(`spa/${ext}/src/vasp/client/crud.${ext}.hbs`),
      );
    }
  }
}
