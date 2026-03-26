import nodemailer from 'nodemailer'
const _transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM_ADDRESS = 'noreply@myapp.com'

/**
 * Send an email using the SmtpMailer mailer.
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
  return _transporter.sendMail({ from: FROM_ADDRESS, to, subject, html })
}
