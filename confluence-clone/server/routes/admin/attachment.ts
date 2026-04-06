import { Elysia } from 'elysia'
import { db } from '../../db/client.ts'
import { eq, sql } from 'drizzle-orm'
import { safeParse } from 'valibot'
import { attachments } from '../../../drizzle/schema.ts'
import { CreateAttachmentSchema, UpdateAttachmentSchema } from '../../../shared/validation.ts'
import { VaspError } from '../../middleware/errorHandler.ts'
import { requireAuth } from '../../auth/middleware.ts'


export const adminAttachmentRoutes = new Elysia({ prefix: '/api/admin/attachment' })
  .use(requireAuth)
  .get('/', async ({ query }) => {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
    const offset = Math.max(Number(query.offset) || 0, 0)
    const [data, countResult] = await Promise.all([
      db.select().from(attachments).limit(limit).offset(offset),
      db.select({ count: sql`count(*)::int` }).from(attachments),
    ])
    const items = data
    return { items, total: countResult[0]?.count ?? 0, limit, offset }
  })
  .get('/:id', async ({ params: { id } }) => {
    const [item] = await db.select().from(attachments).where(eq(attachments.id, Number(id))).limit(1)
    if (!item) throw new VaspError('NOT_FOUND', 'Attachment not found', 404)
    return item
  })
  .post('/', async ({ body, set }) => {
    const parsed = safeParse(CreateAttachmentSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [created] = await db.insert(attachments).values(parsed.output).returning()
    set.status = 201
    return created
  })
  .put('/:id', async ({ params: { id }, body }) => {
    const parsed = safeParse(UpdateAttachmentSchema, body)
    if (!parsed.success) {
      const firstIssue = parsed.issues?.[0]
      throw new VaspError(
        'VALIDATION_FAILED',
        firstIssue?.message ?? 'Invalid request payload',
        400,
      )
    }

    const [updated] = await db
      .update(attachments)
      .set(parsed.output)
      .where(eq(attachments.id, Number(id)))
      .returning()
    if (!updated) throw new VaspError('NOT_FOUND', 'Attachment not found', 404)
    return updated
  })
  .delete('/:id', async ({ params: { id } }) => {
    const [deleted] = await db
      .delete(attachments)
      .where(eq(attachments.id, Number(id)))
      .returning()
    if (!deleted) throw new VaspError('NOT_FOUND', 'Attachment not found', 404)
    return { ok: true }
  })
