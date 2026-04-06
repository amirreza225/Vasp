import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { unwatchPage } from '../../../src/actions/watches.ts'

export const unwatchPageRoute = new Elysia()
  .use(requireAuth)
  .post('/api/actions/unwatchPage', async ({ body, user }) => {
    const result = await unwatchPage({ db, user, args: body })
    return result
  })
