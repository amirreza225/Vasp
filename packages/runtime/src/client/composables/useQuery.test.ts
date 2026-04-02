/**
 * Tests for useQuery – global registry leak guard.
 *
 * We test the registry helpers directly (registerQuery, unregisterQuery,
 * invalidateQueries) and the non-component path of useQuery.  The full
 * Vue-component path (getCurrentInstance, onUnmounted) is an integration
 * concern and would require a full @vue/test-utils mount cycle; the registry
 * plumbing tested here is sufficient to guard against the reported leak.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  queryRegistry,
  registerQuery,
  unregisterQuery,
  invalidateQueries,
} from "./useQuery.js";

// Mock useVasp at module top-level so useQuery can be imported without a
// running Vue application.  getCurrentInstance() returns null in this plain
// Node/Vitest environment, which exercises the outside-component code path.
vi.mock("./useVasp.js", () => ({
  useVasp: () => ({
    $vasp: {
      query: vi.fn(async () => []),
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the global registry between tests. */
function clearRegistry() {
  queryRegistry.clear();
}

// ---------------------------------------------------------------------------
// registerQuery / unregisterQuery
// ---------------------------------------------------------------------------

describe("registerQuery / unregisterQuery", () => {
  beforeEach(clearRegistry);

  it("registers a refresh function under the given name", () => {
    const fn = vi.fn(async () => {});
    registerQuery("getItems", fn);
    expect(queryRegistry.get("getItems")?.has(fn)).toBe(true);
  });

  it("supports multiple refresh functions for the same query name", () => {
    const fn1 = vi.fn(async () => {});
    const fn2 = vi.fn(async () => {});
    registerQuery("getItems", fn1);
    registerQuery("getItems", fn2);
    expect(queryRegistry.get("getItems")?.size).toBe(2);
  });

  it("unregisters a refresh function", () => {
    const fn = vi.fn(async () => {});
    registerQuery("getItems", fn);
    unregisterQuery("getItems", fn);
    expect(queryRegistry.get("getItems")?.has(fn)).toBe(false);
  });

  it("is a no-op when unregistering a name that was never registered", () => {
    expect(() =>
      unregisterQuery(
        "nonExistent",
        vi.fn(async () => {}),
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// invalidateQueries
// ---------------------------------------------------------------------------

describe("invalidateQueries", () => {
  beforeEach(clearRegistry);

  it("calls every registered refresh function for the given names", async () => {
    const fn1 = vi.fn(async () => {});
    const fn2 = vi.fn(async () => {});
    registerQuery("getItems", fn1);
    registerQuery("getOther", fn2);

    await invalidateQueries(["getItems"]);

    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).not.toHaveBeenCalled();
  });

  it("calls all refresh functions when multiple queries are invalidated", async () => {
    const fn1 = vi.fn(async () => {});
    const fn2 = vi.fn(async () => {});
    registerQuery("getItems", fn1);
    registerQuery("getOther", fn2);

    await invalidateQueries(["getItems", "getOther"]);

    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("is a no-op for unknown query names", async () => {
    await expect(invalidateQueries(["doesNotExist"])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useQuery outside a component context — the leak regression
// ---------------------------------------------------------------------------

describe("useQuery outside a component context", () => {
  beforeEach(clearRegistry);

  it("does NOT register the refresh function in queryRegistry", async () => {
    // useVasp is mocked at module top level.
    // getCurrentInstance() returns null outside a component — that is the
    // default in a plain Node/Vitest environment.
    const { useQuery } = await import("./useQuery.js");

    // The registry must be empty before the call.
    expect(queryRegistry.size).toBe(0);

    useQuery("getItems");

    // After calling useQuery outside a component the registry must still be
    // empty — no leak.
    expect(queryRegistry.size).toBe(0);
  });
});
