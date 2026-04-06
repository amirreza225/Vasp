import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { searchHandler } from '../../../src/api/search.ts'

export const searchApiApiRoute = new Elysia()
  .use(requireAuth)
  .get('/api/search', async ({ params, query, body, request, user, set }) => {
    const result = await searchHandler({ db, user, args: { params, query, body, request, set } })
    return result
  })
