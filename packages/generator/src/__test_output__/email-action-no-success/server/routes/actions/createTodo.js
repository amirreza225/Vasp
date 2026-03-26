import { Elysia } from 'elysia'
import { db } from '../../db/client.js'
import { createTodo } from '../../../src/actions.js'

export const createTodoRoute = new Elysia()
  .post('/api/actions/createTodo', async ({ body }) => {
    const result = await createTodo({ db, args: body })
    return result
  })
