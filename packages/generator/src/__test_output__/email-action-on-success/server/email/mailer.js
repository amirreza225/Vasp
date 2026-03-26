import { Resend } from 'resend'
import { welcomeTemplate } from '../../src/emails/welcome.js'
const _client = new Resend(process.env.RESEND_API_KEY)

const FROM_ADDRESS = 'noreply@myapp.com'

/**
 * Send an email using the Mailer mailer.
 *
 * The template function must return an object with:
 *   - to:      string  — recipient email address
 *   - subject: string  — email subject line
 *   - html:    string  — HTML email body
 *
 * @param {Function} templateFn - One of the exported template functions
 * @param {unknown}  data       - Data passed to the template function
 */
export async function sendEmail(templateFn, data) {
  const { to, subject, html } = await templateFn(data)
  return _client.emails.send({ from: FROM_ADDRESS, to, subject, html })
}
