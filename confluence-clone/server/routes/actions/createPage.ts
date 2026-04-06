import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { createPage } from '../../../src/actions/pages.ts'

export const createPageRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/createPage', async ({ body, user }) => {
    const result = await createPage({ db, user, args: body })
    return result
  })
