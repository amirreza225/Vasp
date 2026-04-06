import { Resend } from 'resend'
import { pageCommentEmail } from '../../src/emails/pageComment.ts'
import { pageUpdatedEmail } from '../../src/emails/pageUpdated.ts'
import { welcomeEmail } from '../../src/emails/welcome.ts'

const FROM_ADDRESS = 'no-reply@confluence-clone.com'

/**
 * Send an email using the NotificationEmail mailer.
 *
 * The email provider client is created lazily inside this function so that the
 * module can be safely imported at server startup even when the provider API
 * key env var is not yet set. The error surfaces at the point of sending
 * (e.g. inside an action handler), where it is caught and reported correctly,
 * rather than crashing the entire server process on boot.
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
  const _client = new Resend(process.env.RESEND_API_KEY)
  return _client.emails.send({ from: FROM_ADDRESS, to, subject, html })
}
