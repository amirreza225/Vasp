import { Elysia } from 'elysia'
import { db } from '../db/client.ts'
import { users } from '../../drizzle/schema.ts'
import { eq } from 'drizzle-orm'
import { authPlugin } from './plugin.ts'
import { VaspError } from '../middleware/errorHandler.ts'
import { usernameAndPasswordRoutes } from './providers/usernameAndPassword.ts'

export { authPlugin } from './plugin.ts'

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(authPlugin)
  .use(usernameAndPasswordRoutes)
  .get('/me', async ({ jwt, cookie: { token } }) => {
    const tokenValue = token?.value as string | undefined
    const payload = await jwt.verify(tokenValue ?? '')
    if (!payload || typeof payload.userId !== 'number') {
      throw new VaspError('AUTH_REQUIRED', 'Unauthorized', 401)
    }
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
    if (!user) {
      throw new VaspError('USER_NOT_FOUND', 'User not found', 401)
    }
    const { passwordHash: _ph, ...safeUser } = user
    return safeUser
  })
  .post('/logout', ({ cookie: { token } }) => {
    token?.remove()
    return null
  })
