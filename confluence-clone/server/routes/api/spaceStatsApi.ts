import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { spaceStatsHandler } from '../../../src/api/spaces.ts'

export const spaceStatsApiApiRoute = new Elysia()
  .use(requireAuth)
  .get('/api/spaces/:id/stats', async ({ params, query, body, request, user, set }) => {
    const result = await spaceStatsHandler({ db, user, args: { params, query, body, request, set } })
    return result
  })
