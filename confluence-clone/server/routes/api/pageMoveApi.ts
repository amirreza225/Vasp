import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { movePageHandler } from '../../../src/api/pages.ts'

export const pageMoveApiApiRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/pages/:id/move', async ({ params, query, body, request, user, set }) => {
    const result = await movePageHandler({ db, user, args: { params, query, body, request, set } })
    return result
  })
