import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { swagger } from '@elysiajs/swagger'
import { db } from './db/client.js'
import { logger } from './middleware/logger.js'
import { rateLimit } from './middleware/rateLimit.js'
import { errorHandler } from './middleware/errorHandler.js'
import { vaspDiagnosticRoutes } from './routes/_vasp.js'
import { createTodoRoute } from './routes/actions/createTodo.js'

const PORT = Number(process.env.PORT) || 3001

const REQUIRED_ENV_VARS = []
const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => {
  const value = process.env[name]
  return typeof value !== 'string' || value.trim() === ''
})

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:')
  for (const key of missingEnvVars) {
    console.error(`  - ${key}`)
  }
  process.exit(1)
}

const app = new Elysia()
  .use(swagger({
    path: '/api/docs',
    documentation: {
      info: { title: 'A API', version: '1.0.0' },
    },
  }))
  .use(logger())
  .use(errorHandler())
  .use(cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://localhost:5173'],
    credentials: true,
  }))
  .use(rateLimit())
  .get('/api/health', () => ({ status: 'ok', version: '1.2.0' }))
  .use(vaspDiagnosticRoutes)
  .use(createTodoRoute)
  .listen(PORT)

console.log(`🚀 Vasp backend running at http://localhost:${PORT}`)
