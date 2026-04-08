import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { restorePageVersion } from '../../../src/actions/pages.ts'

export const restorePageVersionRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/restorePageVersion', async ({ body, user }) => {
    const result = await restorePageVersion({ db, user, args: body })
    return result
  })
