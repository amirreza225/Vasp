import { Elysia } from 'elysia'
import { jwtVerify } from 'jose'
import { db } from '../db/client.ts'
import { users } from '../../drizzle/schema.ts'
import { eq } from 'drizzle-orm'
import { VaspError } from '../middleware/errorHandler.ts'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

/**
 * PERMISSIONS — maps each named permission to the list of roles that hold it.
 * Generated from the `permissions` map in the auth block of main.vasp.
 *
 * @example
 *   PERMISSIONS['task:create'] // → ['admin', 'manager', 'member']
 */
export const PERMISSIONS: Record<string, string[]> = {
  'space:create': ['admin'],
  'space:read': ['admin', 'editor', 'viewer'],
  'space:update': ['admin', 'editor'],
  'space:delete': ['admin'],
  'page:create': ['admin', 'editor'],
  'page:read': ['admin', 'editor', 'viewer'],
  'page:update': ['admin', 'editor'],
  'page:delete': ['admin', 'editor'],
  'comment:create': ['admin', 'editor', 'viewer'],
  'comment:delete': ['admin', 'editor'],
  'attachment:upload': ['admin', 'editor'],
  'label:manage': ['admin', 'editor'],
  'admin:access': ['admin'],
}

/**
 * requireAuth — Elysia plugin that verifies the JWT cookie and injects `user` into the context.
 * Use on any route that requires authentication.
 *
 * @example
 * new Elysia().use(requireAuth).get('/protected', ({ user }) => user)
 */
export const requireAuth = new Elysia({ name: 'require-auth' })
  .resolve({ as: 'scoped' }, async ({ cookie, headers }) => {
    // E2E magic token bypass — active only when E2E_MAGIC_TOKEN env var is set and
    // NODE_ENV is not 'production'. Allows test suites to call auth-protected endpoints
    // via  Authorization: Bearer <token>  without a full login flow.
    //
    // If the fixture seeds a user with id=0 into the users table (required for
    // fixtures with ownership/tenant filtering), the middleware does a DB lookup to
    // return the full user record including workspaceId and role. For simple fixtures
    // that do not seed user id=0, a synthetic stub is returned as a fallback.
    if (process.env.NODE_ENV !== 'production' && process.env.E2E_MAGIC_TOKEN) {
      const authHeader = (headers as Record<string, string | undefined>)?.authorization ?? ''
      if (authHeader === 'Bearer ' + process.env.E2E_MAGIC_TOKEN) {
        // Try to load the seeded E2E magic user (id=0) from the DB so that
        // fixtures with tenant/ownership filtering get the full user context
        // (e.g. workspaceId). Falls back to a synthetic stub if no row exists.
        try {
          const [e2eUser] = await db.select().from(users).where(eq(users.id, 0)).limit(1)
          if (e2eUser) {
            const { passwordHash: _ph, ...safeUser } = e2eUser
            return { user: safeUser }
          }
        } catch {
          // Ignore — users table may not exist in minimal fixtures
        }
        return { user: { id: 0, username: 'e2e-admin', email: 'e2e@vasp.test', role: 'admin' } }
      }
    }
    const tokenValue = (cookie?.token?.value as string) ?? ''
    if (!tokenValue) return { user: null }
    try {
      const { payload } = await jwtVerify(tokenValue, JWT_SECRET)
      if (!payload || typeof payload.userId !== 'number') {
        return { user: null }
      }
      const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
      if (!user) {
        return { user: null }
      }
      const { passwordHash: _ph, ...safeUser } = user
      return { user: safeUser }
    } catch (err) {
      console.debug('[auth] JWT verification failed:', err instanceof Error ? err.message : err)
      return { user: null }
    }
  })
  .onBeforeHandle({ as: 'scoped' }, ({ user }) => {
    if (!user) {
      throw new VaspError('AUTH_REQUIRED', 'Authentication required', 401)
    }
  })

export function requireRole(roles: string[]) {
  return new Elysia({ name: 'require-role' })
    .use(requireAuth)
    .onBeforeHandle({ as: 'scoped' }, ({ user }) => {
      const userRole = typeof (user as any)?.role === 'string' ? (user as any).role : ''
      if (!roles.includes(userRole)) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    })
}

/**
 * requirePermission — Elysia plugin that enforces a named RBAC permission.
 * Requires the user to be authenticated AND have a role that holds the given permission.
 *
 * @example
 * new Elysia().use(requirePermission('task:create')).post('/tasks', handler)
 */
export function requirePermission(permission: string) {
  return new Elysia({ name: `require-permission-${permission}` })
    .use(requireAuth)
    .onBeforeHandle({ as: 'scoped' }, ({ user }) => {
      const userRole = typeof (user as any)?.role === 'string' ? (user as any).role : ''
      const allowedRoles = PERMISSIONS[permission] ?? []
      if (!allowedRoles.includes(userRole)) {
        throw new VaspError('AUTH_FORBIDDEN', 'Insufficient permissions', 403)
      }
    })
}
