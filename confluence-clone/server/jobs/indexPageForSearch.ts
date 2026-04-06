import { getBoss, registerDeadLetterWorker } from './boss.ts'
import { indexPageForSearch } from '../../src/jobs/search.ts'

const JOB_NAME = 'indexPageForSearch'
const DLQ_QUEUE = 'failed-search-index'
const RETRY_LIMIT = 3

/**
 * Register the 'indexPageForSearch' job worker with PgBoss.
 * Called once on server startup.
 */
export async function registerIndexPageForSearchWorker() {
  const boss = await getBoss()

  await boss.work(JOB_NAME, async (job) => {
    try {
      await indexPageForSearch(job.data)
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
    console.error('[DLQ] indexPageForSearch job permanently failed:', data)
  })

}

/**
 * Schedule a 'indexPageForSearch' job on demand.
 * @param {unknown} data - Data to pass to the job handler
 */
export async function scheduleIndexPageForSearch(data) {
  const boss = await getBoss()
  return boss.send(JOB_NAME, data, {
    priority: 5,
    retryLimit: RETRY_LIMIT,
    retryDelay: Math.round(1000 / 1000),
    retryBackoff: false,
    expireInMinutes: Number(process.env.JOB_EXPIRE_MINUTES) || 15,
  })
}
