import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { updateSpace } from '../../../src/actions/spaces.ts'

export const updateSpaceRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/updateSpace', async ({ body, user }) => {
    const result = await updateSpace({ db, user, args: body })
    return result
  })
