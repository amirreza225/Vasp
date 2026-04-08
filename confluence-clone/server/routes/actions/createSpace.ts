import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { createSpace } from '../../../src/actions/spaces.ts'

export const createSpaceRoute = new Elysia()
  .use(requireRole(['admin']))
  .post('/api/actions/createSpace', async ({ body, user }) => {
    const result = await createSpace({ db, user, args: body })
    return result
  })
