import { $fetch, type FetchOptions, FetchError } from "ofetch";
import type { VaspClient, VaspClientOptions, ApiEnvelope } from "../types.js";
import { VaspApiError } from "../types.js";

/**
 * Unwrap the server envelope `{ ok, data, error }`.
 * - If `ok: true`  → returns `data`
 * - If `ok: false` → throws `VaspApiError` with structured code/message/hint
 * - If response isn't an envelope (e.g. plain value) → returns as-is
 */
function unwrapEnvelope(response: unknown, statusCode: number = 200): unknown {
  if (response && typeof response === "object" && "ok" in response) {
    const envelope = response as ApiEnvelope;
    if (envelope.ok === false) {
      throw new VaspApiError(envelope.error, statusCode);
    }
    return envelope.data;
  }
  return response;
}

export function createVaspClient(options: VaspClientOptions = {}): VaspClient {
  const baseURL = options.baseURL ?? "/api";

  async function fetcher(
    path: string,
    fetchOptions?: FetchOptions,
  ): Promise<unknown> {
    try {
      const response = await $fetch(path, {
        baseURL,
        credentials: "include",
        ...fetchOptions,
      });
      return unwrapEnvelope(response);
    } catch (err) {
      if (err instanceof VaspApiError) throw err;
      if (err instanceof FetchError && err.data) {
        return unwrapEnvelope(err.data, err.statusCode ?? 500);
      }
      throw err;
    }
  }

  return {
    async query(name: string, args?: unknown) {
      return fetcher(`/queries/${name}`, {
        method: "GET",
        params: args as Record<string, unknown>,
      });
    },
    async action(name: string, args?: unknown) {
      return fetcher(`/actions/${name}`, {
        method: "POST",
        body: args as Record<string, unknown>,
      });
    },
  };
}
