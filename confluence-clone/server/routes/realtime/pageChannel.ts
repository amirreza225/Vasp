import { Elysia } from 'elysia'
import jwt from '@elysiajs/jwt'

// Room-based subscriber map for 'PageChannel' channel
// Each room key maps to a set of connected WebSocket clients
const rooms: Map<string, Set<WebSocket>> = new Map()

function getRoom(roomId: string) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  return rooms.get(roomId)
}

/**
 * Publish a realtime event to all subscribers in a specific room of 'PageChannel'.
 * Called automatically by CRUD mutation handlers.
 */
export function publishPageChannel(event: string, data: unknown, roomId: string = 'default') {
  const room = rooms.get(roomId)
  if (!room) return
  const message = JSON.stringify({ channel: 'pageChannel', room: roomId, event, data })
  for (const ws of room) {
    try { ws.send(message) } catch { room.delete(ws) }
  }
}

/**
 * Broadcast to all rooms of 'PageChannel'.
 */
export function broadcastPageChannel(event: string, data: unknown) {
  const message = JSON.stringify({ channel: 'pageChannel', event, data })
  for (const [, room] of rooms) {
    for (const ws of room) {
      try { ws.send(message) } catch { room.delete(ws) }
    }
  }
}

export const pageChannelChannel = new Elysia()
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET || 'vasp-dev-secret-do-not-use-in-production' }))
  .ws('/ws/pageChannel', {
    async beforeHandle({ jwt: jwtPlugin, request }) {
      // Read JWT from Sec-WebSocket-Protocol header instead of URL query
      const protocols = request.headers.get('sec-websocket-protocol') ?? ''
      const token = protocols.split(',').map(p => p.trim()).find(p => p !== 'vasp-realtime')
      if (!token) return new Response('Unauthorized', { status: 401 })
      const payload = await jwtPlugin.verify(token)
      if (!payload) return new Response('Unauthorized', { status: 401 })
    },
    open(ws) {
      const room = ws.data?.query?.room ?? 'default'
      getRoom(room).add(ws)
      (ws.data as Record<string, unknown>)._room = room
    },
    message(ws, msg) {
      // Client can switch rooms via { action: 'join', room: 'roomId' }
      try {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        if (parsed.action === 'join' && parsed.room) {
          const oldRoom = (ws.data as Record<string, unknown>)._room
          if (oldRoom) {
            const oldRoomSet = rooms.get(oldRoom as string)
            if (oldRoomSet) oldRoomSet.delete(ws)
          }
          (ws.data as Record<string, unknown>)._room = parsed.room
          getRoom(parsed.room).add(ws)
          ws.send(JSON.stringify({ ack: 'joined', room: parsed.room }))
          return
        }
      } catch { /* ignore parse errors */ }
      ws.send(JSON.stringify({ ack: msg }))
    },
    close(ws) {
      const room = (ws.data as Record<string, unknown>)?._room as string | undefined
      if (room) {
        const roomSet = rooms.get(room)
        if (roomSet) {
          roomSet.delete(ws)
          if (roomSet.size === 0) rooms.delete(room)
        }
      }
    },
  })
