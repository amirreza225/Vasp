import { Elysia, t } from 'elysia'
import { db } from '../../db/client.ts'
import { safeParse } from 'valibot'
import { eq, sql, asc, desc, and, ilike, or } from 'drizzle-orm'
import { users } from '../../../drizzle/schema.ts'
import { CreateUserSchema, UpdateUserSchema } from '../../../shared/validation.ts'
import { VaspError } from '../../middleware/errorHandler.ts'
import { requireAuth, PERMISSIONS } from '../../auth/middleware.ts'

export const userCrudRoutes = new Elysia({ prefix: '/api/crud/user' })
  .use(requireAuth)
  .get('/', async ({ query, user }) => {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
    const page = Math.max(Number(query.page) || 1, 1)
    const offset = (page - 1) * limit

    const table = users

    // Allowlisted sort fields
    const SORTABLE_FIELDS = ['username', 'email', 'createdAt']
    const sortBy = SORTABLE_FIELDS.includes(query.sortBy ?? '') ? (query.sortBy as string) : 'id'
    const dirFn = query.dir === 'desc' ? desc : asc
    const orderClauses = [dirFn(table[sortBy] ?? table.id)]

    // Build WHERE conditions
    const conditions = []
    // Allowlisted filter fields: ?filter.fieldName=value
    const FILTERABLE_FIELDS = ['role', 'isActive']
    for (const field of FILTERABLE_FIELDS) {
      const value = (query as Record<string, string | undefined>)[`filter.${field}`]
      if (value !== undefined && table[field]) {
        conditions.push(eq(table[field], value))
      }
    }
    // Full-text search: ?search=keyword
    if (query.search) {
      const pattern = `%${query.search}%`
      conditions.push(or(ilike(table.username, pattern), ilike(table.email, pattern), ilike(table.displayName, pattern))!)
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
      const _allowed = PERMISSIONS['admin:access'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })
  .get('/:id', async ({ params: { id } }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const [item] = await db.select().from(users).where(eq(users.id, Number(id))).limit(1)
    if (!item) throw new VaspError('NOT_FOUND', 'User not found', 404)
    return item
  })
  .put('/:id', async ({ params: { id }, body, user }) => {
    const numId = Number(id)
    if (!Number.isFinite(numId)) throw new VaspError('INVALID_INPUT', 'Invalid id', 400)
    const parsed = safeParse(UpdateUserSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [updated] = await db.update(users).set(parsed.output).where(eq(users.id, Number(id))).returning()
    if (!updated) throw new VaspError('NOT_FOUND', 'User not found', 404)
    return updated
  }, {
    beforeHandle: ({ user }: { user: { role?: unknown } | null }) => {
      const _allowed = PERMISSIONS['admin:access'] ?? []
      if (!_allowed.includes(typeof user?.role === 'string' ? user.role : '')) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    },
  })

