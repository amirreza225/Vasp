import { log } from '../utils/logger.js'

export async function deployCommand(): Promise<void> {
  log.info('vasp deploy is not yet available.')
  log.info('')
  log.info('Planned deployment targets:')
  log.info('  • Fly.io')
  log.info('  • Railway')
  log.info('  • Docker')
  log.info('')
  log.info('For now, build your project with `vasp build` and deploy the output manually.')
  process.exit(0)
}
