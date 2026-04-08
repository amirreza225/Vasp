import PgBoss from 'pg-boss'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required for PgBoss job queue')

// Singleton PgBoss instance shared across all job workers
let boss = null

export async function getBoss() {
  if (!boss) {
    boss = new PgBoss({
      connectionString,
      // Archive completed jobs after 7 days, failed after 30 days
      archiveCompletedAfterSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 30 * 24 * 60 * 60,
    })
    await boss.start()
  }
  return boss
}

/**
 * Register a dead-letter queue worker that fires when a job exhausts all retries.
 * Call this from each job's register function to enable DLQ monitoring.
 */
export async function registerDeadLetterWorker(dlqQueue, onFailed) {
  const b = await getBoss()
  await b.work(dlqQueue, async (job) => {
    await onFailed(job.data)
  })
}
