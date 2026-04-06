import { Elysia, t } from 'elysia'
import { scheduleIndexPageForSearch } from '../../jobs/indexPageForSearch.ts'

export const indexPageForSearchScheduleRoute = new Elysia()
  .post(
    '/api/jobs/indexPageForSearch/schedule',
    async ({ body }) => {
      const id = await scheduleIndexPageForSearch(body)
      return { jobId: id }
    },
    { body: t.Unknown() },
  )
