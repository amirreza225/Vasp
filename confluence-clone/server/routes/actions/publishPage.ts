import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { publishPage } from '../../../src/actions/pages.ts'

export const publishPageRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/publishPage', async ({ body, user }) => {
    const result = await publishPage({ db, user, args: body })
    return result
  })
