import { inject, type App } from 'vue'
import { createVaspClient } from '../axios.js'
import type { VaspClient, VaspClientOptions } from '../../types.js'

const VASP_KEY = '$vasp'

/**
 * Install the Vasp client into a Vue app.
 * Called automatically by the generated vasp/plugin.ts.
 */
export function installVasp(app: App, options: VaspClientOptions = {}): void {
  const client = createVaspClient(options)
  app.provide(VASP_KEY, client)
  app.config.globalProperties[VASP_KEY] = client
}

/**
 * Use the Vasp client inside a Vue component.
 *
 * @example
 * const { $vasp } = useVasp()
 * const todos = await $vasp.query('getTodos')
 */
export function useVasp(): { $vasp: VaspClient } {
  const client = inject<VaspClient>(VASP_KEY)
  if (!client) {
    throw new Error(
      '[vasp] useVasp() was called outside of a Vue component, or the Vasp plugin was not installed. ' +
      'Make sure to call app.use(vaspPlugin) in src/main.ts.',
    )
  }
  return { $vasp: client }
}
