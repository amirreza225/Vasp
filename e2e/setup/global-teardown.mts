import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const APP_DIR = join(resolve(__dirname, '..', '..'), 'e2e', '__pw_app__')

export default async function globalTeardown() {
  if (existsSync(APP_DIR)) {
    rmSync(APP_DIR, { recursive: true, force: true })
  }
}
