import { Elysia } from 'elysia'
import { pageChannelChannel } from './pageChannel.ts'

export const realtimeRoutes = new Elysia()
  .use(pageChannelChannel)
