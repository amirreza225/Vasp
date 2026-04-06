import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { deletePage } from '../../../src/actions/pages.ts'

export const deletePageRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/deletePage', async ({ body, user }) => {
    const result = await deletePage({ db, user, args: body })
    return result
  })
