import { ref, shallowRef, type Ref } from 'vue'
import { useVasp } from './useVasp.js'

export interface UseAuthResult<T = unknown> {
  user: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  isAuthenticated: Ref<boolean>
  login: (credentials: unknown) => Promise<void>
  register: (credentials: unknown) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Reactive auth composable. Manages user session state.
 *
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth()
 */
export function useAuth<T = unknown>(): UseAuthResult<T> {
  const { $vasp } = useVasp()
  const user = shallowRef<T | null>(null)
  const loading = ref(true)
  const error = ref<Error | null>(null)
  const isAuthenticated = ref(false)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const result = await $vasp.query('auth/me')
      user.value = result as T
      isAuthenticated.value = !!result
    } catch {
      user.value = null
      isAuthenticated.value = false
    } finally {
      loading.value = false
    }
  }

  async function login(credentials: unknown) {
    loading.value = true
    error.value = null
    try {
      const result = await $vasp.action('auth/login', credentials)
      user.value = result as T
      isAuthenticated.value = true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      throw error.value
    } finally {
      loading.value = false
    }
  }

  async function register(credentials: unknown) {
    loading.value = true
    error.value = null
    try {
      const result = await $vasp.action('auth/register', credentials)
      user.value = result as T
      isAuthenticated.value = true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      throw error.value
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    loading.value = true
    error.value = null
    try {
      await $vasp.action('auth/logout')
      user.value = null
      isAuthenticated.value = false
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      throw error.value
    } finally {
      loading.value = false
    }
  }

  // Auto-fetch current user on creation
  refresh()

  return { user, loading, error, isAuthenticated, login, register, logout, refresh }
}
