import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { movePage } from '../../../src/actions/pages.ts'

export const movePageRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/movePage', async ({ body, user }) => {
    const result = await movePage({ db, user, args: body })
    return result
  })
