import { Elysia, t } from 'elysia'
import { db } from '../../db/client.ts'
import { users } from '../../../drizzle/schema.ts'
import { eq } from 'drizzle-orm'
import { authPlugin } from '../plugin.ts'
import { VaspError } from '../../middleware/errorHandler.ts'

async function hashPassword(password: string) {
  return Bun.password.hash(password, 'argon2id')
}

async function verifyPassword(password: string, hash: string) {
  return Bun.password.verify(password, hash)
}

// True sliding-window rate limiter for login attempts (per IP, 5 attempts per 60s window).
// NOTE: In-memory only — not shared across replicas.
const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 5
const loginAttempts = new Map()

function checkLoginRateLimit(ip: string) {
  const now = Date.now()
  const windowStart = now - LOGIN_WINDOW_MS
  const timestamps = (loginAttempts.get(ip) || []).filter((t: number) => t > windowStart)
  timestamps.push(now)
  loginAttempts.set(ip, timestamps)
  return timestamps.length <= LOGIN_MAX_ATTEMPTS
}

export const usernameAndPasswordRoutes = new Elysia()
  .use(authPlugin)
  .post(
    '/register',
    async ({ body, jwt, cookie: { token } }) => {
      const existing = await db.select().from(users).where(eq(users.username, body.username)).limit(1)
      if (existing.length > 0) {
        throw new VaspError('USERNAME_TAKEN', 'Username already taken', 400)
      }
      const passwordHash = await hashPassword(body.password)
      const [user] = await db
        .insert(users)
        .values({ username: body.username, email: body.email, passwordHash: passwordHash, displayName: body.displayName ?? null, bio: body.bio ?? null, isActive: body.isActive })
        .returning()
      if (!user) {
        throw new VaspError('REGISTER_FAILED', 'Failed to create user', 500)
      }
      const tokenValue = await jwt.sign({ userId: user.id })
      token.set({ value: tokenValue, httpOnly: true, sameSite: 'lax', path: '/' })
      const { passwordHash: _ph, ...safeUser } = user
      return safeUser
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 8 }),
        email: t.String({ format: 'email' }),
        displayName: t.Optional(t.String()),
        bio: t.Optional(t.String()),
        isActive: t.Boolean(),
      }),
    },
  )
  .post(
    '/login',
    async ({ body, jwt, cookie: { token }, request }) => {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      if (!checkLoginRateLimit(ip)) {
        throw new VaspError('RATE_LIMIT_EXCEEDED', 'Too many login attempts. Please try again later.', 429)
      }

      const [user] = await db.select().from(users).where(eq(users.username, body.username)).limit(1)
      if (!user || !user.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new VaspError('INVALID_CREDENTIALS', 'Invalid username or password', 401)
      }
      const tokenValue = await jwt.sign({ userId: user.id })
      token.set({ value: tokenValue, httpOnly: true, sameSite: 'lax', path: '/' })
      const { passwordHash: _ph, ...safeUser } = user
      return safeUser
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    },
  )
