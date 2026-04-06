import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { getPageComments } from '../../../src/queries/comments.ts'

export const getPageCommentsRoute = new Elysia()
  .use(requireAuth)
  .get('/api/queries/getPageComments', async ({ query, user }) => {
    const result = await getPageComments({ db, user, args: query })
    return result
  })
