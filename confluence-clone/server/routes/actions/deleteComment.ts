import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { deleteComment } from '../../../src/actions/comments.ts'

export const deleteCommentRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/deleteComment', async ({ body, user }) => {
    const result = await deleteComment({ db, user, args: body })
    return result
  })
