import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { getSpaces } from '../../../src/queries/spaces.ts'

export const getSpacesRoute = new Elysia()
  .use(requireAuth)
  .get('/api/queries/getSpaces', async ({ query, user }) => {
    const result = await getSpaces({ db, user, args: query })
    return result
  })
