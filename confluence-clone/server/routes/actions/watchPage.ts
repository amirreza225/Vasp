import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { watchPage } from '../../../src/actions/watches.ts'

export const watchPageRoute = new Elysia()
  .use(requireAuth)
  .post('/api/actions/watchPage', async ({ body, user }) => {
    const result = await watchPage({ db, user, args: body })
    return result
  })
