import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { getPageVersions } from '../../../src/queries/pages.ts'

export const getPageVersionsRoute = new Elysia()
  .use(requireAuth)
  .get('/api/queries/getPageVersions', async ({ query, user }) => {
    const result = await getPageVersions({ db, user, args: query })
    return result
  })
