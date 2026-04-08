import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { getPage } from '../../../src/queries/pages.ts'
import { getCached, setCached, DEFAULT_TTL } from '../../cache/pageCache.ts'
const _CACHE_KEY = 'getPage'
const _CACHE_TTL = 60

export const getPageRoute = new Elysia()
  .use(requireAuth)
  .get('/api/queries/getPage', async ({ query, user }) => {
    const _cached = await getCached(_CACHE_KEY)
    if (_cached !== null) return _cached
    const result = await getPage({ db, user, args: query })
    await setCached(_CACHE_KEY, result, _CACHE_TTL)
    return result
  })
