import { getBoss, registerDeadLetterWorker } from './boss.ts'
import { sendCommentNotifications } from '../../src/jobs/notifications.ts'

const JOB_NAME = 'sendCommentNotifications'
const DLQ_QUEUE = 'failed-notifications'
const RETRY_LIMIT = 3

/**
 * Register the 'sendCommentNotifications' job worker with PgBoss.
 * Called once on server startup.
 */
export async function registerSendCommentNotificationsWorker() {
  const boss = await getBoss()

  await boss.work(JOB_NAME, async (job) => {
    try {
      await sendCommentNotifications(job.data)
    } catch (err) {
      // When this is the final retry attempt, publish to the dead-letter queue
      if (job.retryCount >= RETRY_LIMIT - 1) {
        await boss.send(DLQ_QUEUE, {
          originalJobId: job.id,
          originalJobData: job.data,
          error: err instanceof Error ? err.message : String(err),
          failedAt: new Date().toISOString(),
        })
      }
      throw err
    }
  })

  // Monitor the dead-letter queue for permanently failed jobs
  await registerDeadLetterWorker(DLQ_QUEUE, async (data) => {
    console.error('[DLQ] sendCommentNotifications job permanently failed:', data)
  })

}

/**
 * Schedule a 'sendCommentNotifications' job on demand.
 * @param {unknown} data - Data to pass to the job handler
 */
export async function scheduleSendCommentNotifications(data) {
  const boss = await getBoss()
  return boss.send(JOB_NAME, data, {
    priority: 10,
    retryLimit: RETRY_LIMIT,
    retryDelay: Math.round(2000 / 1000),
    retryBackoff: true,
    expireInMinutes: Number(process.env.JOB_EXPIRE_MINUTES) || 15,
  })
}
