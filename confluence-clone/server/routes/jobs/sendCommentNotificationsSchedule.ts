import { Elysia, t } from 'elysia'
import { scheduleSendCommentNotifications } from '../../jobs/sendCommentNotifications.ts'

export const sendCommentNotificationsScheduleRoute = new Elysia()
  .post(
    '/api/jobs/sendCommentNotifications/schedule',
    async ({ body }) => {
      const id = await scheduleSendCommentNotifications(body)
      return { jobId: id }
    },
    { body: t.Unknown() },
  )
