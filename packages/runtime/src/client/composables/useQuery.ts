import { ref, shallowRef, type Ref } from 'vue'
import { useVasp } from './useVasp.js'

export interface UseQueryResult<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
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

  // Auto-fetch on creation
  refresh()

  return { data, loading, error, refresh }
}
