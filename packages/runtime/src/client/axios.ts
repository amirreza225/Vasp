import { $fetch, type FetchOptions } from 'ofetch'
import type { VaspClient, VaspClientOptions } from '../types.js'

export function createVaspClient(options: VaspClientOptions = {}): VaspClient {
  const baseURL = options.baseURL ?? '/api'

  const fetcher = (path: string, fetchOptions?: FetchOptions) =>
    $fetch(path, {
      baseURL,
      credentials: 'include',
      ...fetchOptions,
    })

  return {
    async query(name: string, args?: unknown) {
      return fetcher(`/queries/${name}`, {
        method: 'GET',
        query: args as Record<string, unknown>,
      })
    },
    async action(name: string, args?: unknown) {
      return fetcher(`/actions/${name}`, {
        method: 'POST',
        body: args,
      })
    },
  }
}
