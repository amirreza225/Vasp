import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { eq, sql } from 'drizzle-orm'
import { safeParse } from 'valibot'
import { users } from '../../../drizzle/schema.ts'
import { CreateUserSchema, UpdateUserSchema } from '../../../shared/validation.ts'
import { VaspError } from '../../middleware/errorHandler.ts'
import { requireAuth } from '../../auth/middleware.ts'

const MIN_PASSWORD_LENGTH = 8


export const adminUserRoutes = new Elysia({ prefix: '/api/admin/user' })
  .use(requireAuth)
  .get('/', async ({ query }) => {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
    const offset = Math.max(Number(query.offset) || 0, 0)
    const [data, countResult] = await Promise.all([
      db.select().from(users).limit(limit).offset(offset),
      db.select({ count: sql`count(*)::int` }).from(users),
    ])
    const items = data.map(({ passwordHash: _ph, ...rest }) => rest)
    return { items, total: countResult[0]?.count ?? 0, limit, offset }
  })
  .get('/:id', async ({ params: { id } }) => {
    const [item] = await db.select().from(users).where(eq(users.id, Number(id))).limit(1)
    if (!item) throw new VaspError('NOT_FOUND', 'User not found', 404)

    const { passwordHash: _ph, ...safe } = item
    return safe
  })
  .post('/', async ({ body, set }) => {
    const parsed = safeParse(CreateUserSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const rawBody = body as Record<string, unknown>
    const rawPassword = typeof rawBody?.['password'] === 'string' ? rawBody['password'] : ''
    if (rawPassword.length < MIN_PASSWORD_LENGTH) {
      throw new VaspError('VALIDATION_FAILED', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
    }
    const passwordHash = await Bun.password.hash(rawPassword, 'argon2id')
    const [created] = await db.insert(users).values({ ...parsed.output, passwordHash }).returning()
    set.status = 201
    const { passwordHash: _ph, ...safeCreated } = created
    return safeCreated
  })
  .put('/:id', async ({ params: { id }, body }) => {
    const parsed = safeParse(UpdateUserSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const rawBody = body as Record<string, unknown>
    const rawPassword = typeof rawBody?.['password'] === 'string' ? rawBody['password'] : ''
    if (rawPassword.length > 0 && rawPassword.length < MIN_PASSWORD_LENGTH) {
      throw new VaspError('VALIDATION_FAILED', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
    }
    const passwordHash = rawPassword.length >= MIN_PASSWORD_LENGTH ? await Bun.password.hash(rawPassword, 'argon2id') : undefined
    const [updated] = await db
      .update(users)
      .set({ ...parsed.output, ...(passwordHash !== undefined ? { passwordHash } : {}) })
      .where(eq(users.id, Number(id)))
      .returning()
    if (!updated) throw new VaspError('NOT_FOUND', 'User not found', 404)
    const { passwordHash: _ph, ...safeUpdated } = updated
    return safeUpdated
  })
  .delete('/:id', async ({ params: { id } }) => {
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, Number(id)))
      .returning()
    if (!deleted) throw new VaspError('NOT_FOUND', 'User not found', 404)
    return { ok: true }
  })
