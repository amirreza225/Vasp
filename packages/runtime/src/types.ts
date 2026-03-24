export interface VaspClientOptions {
  baseURL?: string
}

export type VaspQueryFn = (name: string, args?: unknown) => Promise<unknown>
export type VaspActionFn = (name: string, args?: unknown) => Promise<unknown>

export interface VaspClient {
  query: VaspQueryFn
  action: VaspActionFn
}
