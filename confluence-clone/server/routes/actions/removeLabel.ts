import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { removeLabel } from '../../../src/actions/labels.ts'

export const removeLabelRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/removeLabel', async ({ body, user }) => {
    const result = await removeLabel({ db, user, args: body })
    return result
  })
