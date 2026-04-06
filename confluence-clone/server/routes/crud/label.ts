import { Elysia, t } from 'elysia'
import { db } from '../../db/client.ts'
import { safeParse } from 'valibot'
import { eq, sql, asc, desc, and, ilike, or } from 'drizzle-orm'
import { labels } from '../../../drizzle/schema.ts'
import { CreateLabelSchema, UpdateLabelSchema } from '../../../shared/validation.ts'
import { VaspError } from '../../middleware/errorHandler.ts'
import { requireAuth, PERMISSIONS } from '../../auth/middleware.ts'

export const labelCrudRoutes = new Elysia({ prefix: '/api/crud/label' })
  .use(requireAuth)
  .get('/', async ({ query, user }) => {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
    const page = Math.max(Number(query.page) || 1, 1)
    const offset = (page - 1) * limit

    const table = labels

    // Allowlisted sort fields
    const SORTABLE_FIELDS = ['name']
    const sortBy = SORTABLE_FIELDS.includes(query.sortBy ?? '') ? (query.sortBy as string) : 'id'
    const dirFn = query.dir === 'desc' ? desc : asc
    const orderClauses = [dirFn(table[sortBy] ?? table.id)]

    // Build WHERE conditions
    const conditions = []
    // Allowlisted filter fields derived from entity declaration: ?filter.fieldName=value
    const FILTERABLE_FIELDS = ['id', 'name', 'color']
    for (const field of FILTERABLE_FIELDS) {
      const value = (query as Record<string, string | undefined>)[`filter.${field}`]
      if (value !== undefined && table[field]) {
        conditions.push(eq(table[field], value))
      }
    }
    // Full-text search: ?search=keyword
    if (query.search) {
      const pattern = `%${query.search}%`
      conditions.push(or(ilike(table.name, pattern))!)
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const baseQuery = db.select().from(table)
    const countQuery = db.select({ count: sql`count(*)::int` }).from(table)

    const [data, countResult] = await Promise.all([
      (where ? baseQuery.where(where) : baseQuery).orderBy(...orderClauses).limit(limit).offset(offset),
      where ? countQuery.where(where) : countQuery,
    ])

    return { items: data, total: countResult[0]?.count ?? 0, page, limit, offset }
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['space:read'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .post('/', async ({ body, set, user }) => {
    const parsed = safeParse(CreateLabelSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [created] = await db.insert(labels).values(parsed.output).returning()
    set.status = 201
    return created
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['label:manage'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .get('/:id', async ({ params: { id } }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const [item] = await db.select().from(labels).where(eq(labels.id, Number(id))).limit(1)
    if (!item) throw new VaspError('NOT_FOUND', 'Label not found', 404)
    return item
  })
  .put('/:id', async ({ params: { id }, body, user }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const parsed = safeParse(UpdateLabelSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [updated] = await db.update(labels).set(parsed.output).where(eq(labels.id, Number(id))).returning()
    if (!updated) throw new VaspError('NOT_FOUND', 'Label not found', 404)
    return updated
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['label:manage'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .delete('/:id', async ({ params: { id }, user }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const [deleted] = await db.delete(labels).where(eq(labels.id, Number(id))).returning()
    if (!deleted) throw new VaspError('NOT_FOUND', 'Label not found', 404)
    return { ok: true }
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['label:manage'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })

