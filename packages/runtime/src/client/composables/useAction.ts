import { ref, type Ref } from 'vue'
import { useVasp } from './useVasp.js'

export interface UseActionResult<T> {
  execute: (args?: unknown) => Promise<T>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

/**
 * Reactive action composable.
 *
 * @example
 * const { execute: createTodo, loading } = useAction('createTodo')
 * await createTodo({ text: 'Buy milk' })
 */
export function useAction<T = unknown>(actionName: string): UseActionResult<T> {
  const { $vasp } = useVasp()
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function execute(args?: unknown): Promise<T> {
    loading.value = true
    error.value = null
    try {
      return (await $vasp.action(actionName, args)) as T
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      throw error.value
    } finally {
      loading.value = false
    }
  }

  return { execute, loading, error }
}
