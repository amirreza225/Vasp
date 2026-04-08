import { Elysia, t } from 'elysia'
import { db } from '../../db/client.ts'
import { safeParse } from 'valibot'
import { eq, sql, asc, desc, and, ilike, or } from 'drizzle-orm'
import { pages } from '../../../drizzle/schema.ts'
import { CreatePageSchema, UpdatePageSchema } from '../../../shared/validation.ts'
import { VaspError } from '../../middleware/errorHandler.ts'
import { requireAuth, PERMISSIONS } from '../../auth/middleware.ts'
import { publishPageChannel } from '../realtime/pageChannel.ts'

export const pageCrudRoutes = new Elysia({ prefix: '/api/crud/page' })
  .use(requireAuth)
  .get('/', async ({ query, user }) => {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
    const page = Math.max(Number(query.page) || 1, 1)
    const offset = (page - 1) * limit

    const table = pages

    // Allowlisted sort fields
    const SORTABLE_FIELDS = ['title', 'createdAt', 'updatedAt', 'status']
    const sortBy = SORTABLE_FIELDS.includes(query.sortBy ?? '') ? (query.sortBy as string) : 'id'
    const dirFn = query.dir === 'desc' ? desc : asc

    // Build WHERE conditions
    const relConditions = []
    const REL_FILTERABLE_FIELDS = ['status']
    for (const field of REL_FILTERABLE_FIELDS) {
      const value = (query as Record<string, string | undefined>)[`filter.${field}`]
      if (value !== undefined && table[field]) {
        relConditions.push(eq(table[field], value))
      }
    }
    if (query.search) {
      const pattern = `%${query.search}%`
      relConditions.push(or(ilike(table.title, pattern))!)
    }
    const relWhere = relConditions.length > 0 ? and(...relConditions) : undefined

    const items = await db.query.pages.findMany({
      with: {
        space: true,
        author: true,
        parent: true,
      },
      ...(relWhere ? { where: relWhere } : {}),
      orderBy: [dirFn(table[sortBy] ?? table.id)],
      limit,
      offset,
    })
    const [countResult] = await db.select({ count: sql`count(*)::int` }).from(pages)
    return { items, total: countResult?.count ?? 0, page, limit, offset }
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['page:read'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .post('/', async ({ body, set, user }) => {
    const parsed = safeParse(CreatePageSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [created] = await db.insert(pages).values(parsed.output).returning()
    publishPageChannel('created', created)
    set.status = 201
    return created
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['page:create'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .get('/:id', async ({ params: { id } }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const item = await db.query.pages.findFirst({
      where: (t, { eq, and }) => eq(t.id, Number(id)),
      with: {
        space: true,
        author: true,
        parent: true,
      },
    })
    if (!item) throw new VaspError('NOT_FOUND', 'Page not found', 404)
    return item
  })
  .put('/:id', async ({ params: { id }, body, user }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const parsed = safeParse(UpdatePageSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [updated] = await db.update(pages).set(parsed.output).where(eq(pages.id, Number(id))).returning()
    if (!updated) throw new VaspError('NOT_FOUND', 'Page not found', 404)
    publishPageChannel('updated', updated)
    return updated
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['page:update'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .delete('/:id', async ({ params: { id }, user }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const [deleted] = await db.delete(pages).where(eq(pages.id, Number(id))).returning()
    if (!deleted) throw new VaspError('NOT_FOUND', 'Page not found', 404)
    publishPageChannel('deleted', deleted)
    return { ok: true }
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['page:delete'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })

