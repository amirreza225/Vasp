import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { createComment } from '../../../src/actions/comments.ts'
import { pageCommentEmail } from '../../../src/emails/pageComment.ts'
import { sendEmail } from '../../email/notificationEmail.ts'

export const createCommentRoute = new Elysia()
  .use(requireAuth)
  .post('/api/actions/createComment', async ({ body, user }) => {
    const result = await createComment({ db, user, args: body })
    await sendEmail(pageCommentEmail, result)
    return result
  })
