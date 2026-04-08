import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { requireAuth } from '../../auth/middleware.ts'
import { getPageTree } from '../../../src/queries/pages.ts'
import { getCached, setCached, DEFAULT_TTL } from '../../cache/pageCache.ts'
const _CACHE_KEY = 'getPageTree'
const _CACHE_TTL = 30

export const getPageTreeRoute = new Elysia()
  .use(requireAuth)
  .get('/api/queries/getPageTree', async ({ query, user }) => {
    const _cached = await getCached(_CACHE_KEY)
    if (_cached !== null) return _cached
    const result = await getPageTree({ db, user, args: query })
    await setCached(_CACHE_KEY, result, _CACHE_TTL)
    return result
  })
