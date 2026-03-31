import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { logger } from './middleware/logger.ts'
import { rateLimit } from './middleware/rateLimit.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { vaspDiagnosticRoutes } from './routes/_vasp.ts'
import { csrfProtection } from './middleware/csrf.ts'

const PORT = Number(process.env.PORT) || 3001

export const app = new Elysia()
  .use(swagger({
    path: '/api/docs',
    documentation: {
      info: { title: 'SsrTsDebug API', version: '1.0.0' },
    },
  }))
  .use(logger())
  .use(errorHandler())
  .use(cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
      : ['http://localhost:3000'],
    credentials: true,
  }))
  .use(rateLimit())
  .use(csrfProtection())
  .get('/api/health', () => ({ status: 'ok', version: '1.3.0' }))
  .use(vaspDiagnosticRoutes)
  .listen(PORT)

console.log(`🚀 Vasp backend running at http://localhost:${PORT}`)
