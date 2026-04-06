import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth, requireRole } from '../../auth/middleware.ts'
import { updatePage } from '../../../src/actions/pages.ts'
import { pageUpdatedEmail } from '../../../src/emails/pageUpdated.ts'
import { sendEmail } from '../../email/notificationEmail.ts'

export const updatePageRoute = new Elysia()
  .use(requireRole(['admin', 'editor']))
  .post('/api/actions/updatePage', async ({ body, user }) => {
    const result = await updatePage({ db, user, args: body })
    await sendEmail(pageUpdatedEmail, result)
    return result
  })
