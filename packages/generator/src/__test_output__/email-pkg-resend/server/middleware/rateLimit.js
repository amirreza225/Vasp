import { Elysia } from 'elysia'
import { VaspError } from './errorHandler.js'

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 100
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000

const hits = new Map()

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of hits) {
    if (now - entry.start > WINDOW_MS) hits.delete(key)
  }
}, 60_000)

/**
 * Simple in-memory sliding-window rate limiter.
 * Limits each IP to MAX_REQUESTS per WINDOW_MS.
 */
export function rateLimit() {
  return new Elysia({ name: 'rate-limit' })
    .onBeforeHandle(({ request, set }) => {
      const ip = request.headers.get('x-forwarded-for')
        || request.headers.get('x-real-ip')
        || 'unknown'
      const now = Date.now()
      let entry = hits.get(ip)

      if (!entry || now - entry.start > WINDOW_MS) {
        entry = { start: now, count: 0 }
        hits.set(ip, entry)
      }

      entry.count++

      set.headers['x-ratelimit-limit'] = String(MAX_REQUESTS)
      set.headers['x-ratelimit-remaining'] = String(Math.max(0, MAX_REQUESTS - entry.count))

      if (entry.count > MAX_REQUESTS) {
        throw new VaspError('RATE_LIMITED', 'Too many requests. Please try again later.', 429)
      }
    })
}
