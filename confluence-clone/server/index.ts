// OpenTelemetry instrumentation — must be imported before all other server modules
import './telemetry/index.ts'
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { logger } from './middleware/logger.ts'
import { rateLimit } from './middleware/rateLimit.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { vaspDiagnosticRoutes } from './routes/_vasp.ts'
import { csrfProtection } from './middleware/csrf.ts'
import { authRoutes } from './auth/index.ts'
import { getSpacesRoute } from './routes/queries/getSpaces.ts'
import { getSpaceRoute } from './routes/queries/getSpace.ts'
import { getPageTreeRoute } from './routes/queries/getPageTree.ts'
import { getPageRoute } from './routes/queries/getPage.ts'
import { getPageVersionsRoute } from './routes/queries/getPageVersions.ts'
import { searchPagesRoute } from './routes/queries/searchPages.ts'
import { getRecentlyUpdatedPagesRoute } from './routes/queries/getRecentlyUpdatedPages.ts'
import { getPageCommentsRoute } from './routes/queries/getPageComments.ts'
import { createSpaceRoute } from './routes/actions/createSpace.ts'
import { updateSpaceRoute } from './routes/actions/updateSpace.ts'
import { createPageRoute } from './routes/actions/createPage.ts'
import { updatePageRoute } from './routes/actions/updatePage.ts'
import { publishPageRoute } from './routes/actions/publishPage.ts'
import { movePageRoute } from './routes/actions/movePage.ts'
import { restorePageVersionRoute } from './routes/actions/restorePageVersion.ts'
import { deletePageRoute } from './routes/actions/deletePage.ts'
import { createCommentRoute } from './routes/actions/createComment.ts'
import { deleteCommentRoute } from './routes/actions/deleteComment.ts'
import { addLabelRoute } from './routes/actions/addLabel.ts'
import { removeLabelRoute } from './routes/actions/removeLabel.ts'
import { watchPageRoute } from './routes/actions/watchPage.ts'
import { unwatchPageRoute } from './routes/actions/unwatchPage.ts'
import { searchApiApiRoute } from './routes/api/searchApi.ts'
import { pageExportApiApiRoute } from './routes/api/pageExportApi.ts'
import { pageMoveApiApiRoute } from './routes/api/pageMoveApi.ts'
import { spaceStatsApiApiRoute } from './routes/api/spaceStatsApi.ts'
import { labelCrudRoutes } from './routes/crud/label.ts'
import { userCrudRoutes } from './routes/crud/user.ts'
import { pageCrudRoutes } from './routes/crud/page.ts'
import { realtimeRoutes } from './routes/realtime/index.ts'
import { sendCommentNotificationsScheduleRoute } from './routes/jobs/sendCommentNotificationsSchedule.ts'
import { indexPageForSearchScheduleRoute } from './routes/jobs/indexPageForSearchSchedule.ts'
import { adminRoutes } from './routes/admin/index.ts'
import { avatarStorageUploadRoutes } from './routes/storage/avatarStorage.ts'
import { attachmentStorageUploadRoutes } from './routes/storage/attachmentStorage.ts'

const PORT = Number(process.env.PORT) || 3001

// ── Environment variable validation ─────────────────────────────────────────

if (!process.env.NODE_ENV?.trim()) process.env.NODE_ENV = 'development'

if (!process.env.PORT?.trim()) process.env.PORT = '3001'

if (!process.env.S3_REGION?.trim()) process.env.S3_REGION = 'us-east-1'

{
  const _envErrors = []
  // DATABASE_URL: required String
  if (!process.env.DATABASE_URL?.trim()) _envErrors.push('DATABASE_URL is required')
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.length < 20) _envErrors.push(`DATABASE_URL must be at least 20 characters long (got ${process.env.DATABASE_URL.length})`)
  // JWT_SECRET: required String
  if (!process.env.JWT_SECRET?.trim()) _envErrors.push('JWT_SECRET is required')
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) _envErrors.push(`JWT_SECRET must be at least 32 characters long (got ${process.env.JWT_SECRET.length})`)
  // NODE_ENV: required Enum(development, staging, production)
  if (!process.env.NODE_ENV?.trim()) _envErrors.push('NODE_ENV is required (must be one of: development, staging, production)')
  if (process.env.NODE_ENV && !['development', 'staging', 'production'].includes(process.env.NODE_ENV)) _envErrors.push('NODE_ENV must be one of: development, staging, production (got "' + process.env.NODE_ENV + '")')
  // PORT: optional Int
  if (process.env.PORT && isNaN(Number(process.env.PORT))) _envErrors.push('PORT must be an integer (got "' + process.env.PORT + '")')
  if (process.env.PORT && Number(process.env.PORT) < 1024) _envErrors.push('PORT must be >= 1024 (got ' + process.env.PORT + ')')
  if (process.env.PORT && Number(process.env.PORT) > 65535) _envErrors.push('PORT must be <= 65535 (got ' + process.env.PORT + ')')
  // S3_BUCKET: optional String
  // S3_REGION: optional String
  // AWS_ACCESS_KEY_ID: optional String
  // AWS_SECRET_ACCESS_KEY: optional String
  // RESEND_API_KEY: optional String
  // FROM_EMAIL: optional String
  // REDIS_URL: optional String
  if (_envErrors.length > 0) {
    console.error('❌ Environment variable validation failed:')
    for (const _e of _envErrors) console.error('  - ' + _e)
    process.exit(1)
  }
}
// ── Scalar API Reference bundle — self-hosted proxy so the docs UI works
// even in environments where the jsdelivr.net CDN is blocked in the browser.
// The server can always reach the CDN; the bundle is cached in memory after
// the first request so subsequent loads are instant.
let _scalarBundle: string | null = null
async function getScalarBundle(): Promise<string> {
  if (_scalarBundle) return _scalarBundle
  const CDN_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/browser/standalone.min.js'
  const res = await fetch(CDN_URL)
  _scalarBundle = await res.text()
  return _scalarBundle
}

export const app = new Elysia()
  .use(swagger({
    path: '/api/docs',
    documentation: {
      info: { title: 'ConfluenceClone API', version: '1.0.0' },
    },
    scalarCDN: '/api/scalar.js',
  }))
  .use(logger())
  .use(errorHandler())
  .use(cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:5174'],
    credentials: true,
  }))
  .use(rateLimit())
  .use(csrfProtection())
  .get('/api/health', () => ({ status: 'ok', version: '1.3.0' }))
  .get('/api/scalar.js', async ({ set }) => {
    set.headers['content-type'] = 'application/javascript; charset=utf-8'
    set.headers['cache-control'] = 'public, max-age=86400'
    try {
      return await getScalarBundle()
    } catch {
      return '// Scalar API Reference bundle could not be loaded'
    }
  })
  .get('/', ({ redirect }) => redirect('/api/docs', 302))
  .use(vaspDiagnosticRoutes)
  .use(authRoutes)
  .use(getSpacesRoute)
  .use(getSpaceRoute)
  .use(getPageTreeRoute)
  .use(getPageRoute)
  .use(getPageVersionsRoute)
  .use(searchPagesRoute)
  .use(getRecentlyUpdatedPagesRoute)
  .use(getPageCommentsRoute)
  .use(createSpaceRoute)
  .use(updateSpaceRoute)
  .use(createPageRoute)
  .use(updatePageRoute)
  .use(publishPageRoute)
  .use(movePageRoute)
  .use(restorePageVersionRoute)
  .use(deletePageRoute)
  .use(createCommentRoute)
  .use(deleteCommentRoute)
  .use(addLabelRoute)
  .use(removeLabelRoute)
  .use(watchPageRoute)
  .use(unwatchPageRoute)
  .use(searchApiApiRoute)
  .use(pageExportApiApiRoute)
  .use(pageMoveApiApiRoute)
  .use(spaceStatsApiApiRoute)
  .use(labelCrudRoutes)
  .use(userCrudRoutes)
  .use(pageCrudRoutes)
  .use(realtimeRoutes)
  .use(sendCommentNotificationsScheduleRoute)
  .use(indexPageForSearchScheduleRoute)
  .use(adminRoutes)
  .use(avatarStorageUploadRoutes)
  .use(attachmentStorageUploadRoutes)
  .listen(PORT)

console.log(`🚀 Vasp backend running at http://localhost:${PORT}`)
