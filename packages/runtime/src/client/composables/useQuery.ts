import { getCurrentInstance, onUnmounted, ref, shallowRef, type Ref } from 'vue'
import { useVasp } from './useVasp.js'

export interface UseQueryResult<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
}

// Global registry of active queries for invalidation by useAction
const queryRegistry = new Map<string, Set<() => Promise<void>>>()

export function registerQuery(name: string, refreshFn: () => Promise<void>): void {
  if (!queryRegistry.has(name)) queryRegistry.set(name, new Set())
  queryRegistry.get(name)!.add(refreshFn)
}

export function unregisterQuery(name: string, refreshFn: () => Promise<void>): void {
  queryRegistry.get(name)?.delete(refreshFn)
}

export async function invalidateQueries(names: string[]): Promise<void> {
  const tasks: Promise<void>[] = []
  for (const name of names) {
    const fns = queryRegistry.get(name)
    if (fns) {
      for (const fn of fns) tasks.push(fn())
    }
  }
  await Promise.all(tasks)
}

/**
 * Reactive query composable. Fetches data on mount and provides refresh.
 *
 * @example
 * const { data: todos, loading, error } = useQuery('getTodos')
 */
export function useQuery<T = unknown>(
  queryName: string,
  args?: unknown,
): UseQueryResult<T> {
  const { $vasp } = useVasp()
  const data = shallowRef<T | null>(null)
  const loading = ref(true)
  const error = ref<Error | null>(null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      data.value = (await $vasp.query(queryName, args)) as T
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      loading.value = false
    }
  }

  // Register for invalidation
  registerQuery(queryName, refresh)

  // Clean up registry on component unmount to prevent memory leaks
  if (getCurrentInstance()) {
    onUnmounted(() => unregisterQuery(queryName, refresh))
  }

  // Auto-fetch on creation
  refresh()

  return { data, loading, error, refresh }
}
