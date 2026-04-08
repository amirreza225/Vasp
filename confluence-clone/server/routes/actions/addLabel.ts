import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { addLabel } from '../../../src/actions/labels.ts'

export const addLabelRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/addLabel', async ({ body, user }) => {
    const result = await addLabel({ db, user, args: body })
    return result
  })
