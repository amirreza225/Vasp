import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { exportPageHandler } from '../../../src/api/export.ts'

export const pageExportApiApiRoute = new Elysia()
  .use(requireAuth)
  .get('/api/pages/:id/export', async ({ params, query, body, request, user, set }) => {
    const result = await exportPageHandler({ db, user, args: { params, query, body, request, set } })
    return result
  })
