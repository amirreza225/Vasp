import { Elysia } from 'elysia'
import { db } from '../../db/client.js'
import { registerUser } from '../../../src/actions.js'
import { welcomeTemplate } from '../../../src/emails/welcome.js'
import { sendEmail } from '../../email/mailer.js'

export const registerUserRoute = new Elysia()
  .post('/api/actions/registerUser', async ({ body }) => {
    const result = await registerUser({ db, args: body })
    await sendEmail(welcomeTemplate, result)
    return result
  })
