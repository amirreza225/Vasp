import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { searchPages } from '../../../src/queries/search.ts'

export const searchPagesRoute = new Elysia()
  .use(requireAuth)
  .get('/api/queries/searchPages', async ({ query, user }) => {
    const result = await searchPages({ db, user, args: query })
    return result
  })
