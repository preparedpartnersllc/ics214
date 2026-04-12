/**
 * SMS notification infrastructure.
 *
 * Twilio is not yet configured — when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * and TWILIO_FROM_NUMBER are added to environment variables, SMS will be sent
 * automatically. Until then, the function returns { sent: false, reason: 'not_configured' }
 * and in-app notifications serve as the fallback.
 */

export type SMSResult =
  | { sent: true;  reason: 'sent' }
  | { sent: false; reason: 'no_phone' | 'not_configured' | 'failed'; error?: string }

/**
 * Attempt to send an SMS. Safe to call from server-side API routes or
 * server actions. Never call from client components.
 *
 * @param to  E.164 phone number (e.g. "+13135550100") or null
 * @param body Message text
 */
export async function sendSMS(to: string | null | undefined, body: string): Promise<SMSResult> {
  if (!to) return { sent: false, reason: 'no_phone' }

  const accountSid  = process.env.TWILIO_ACCOUNT_SID
  const authToken   = process.env.TWILIO_AUTH_TOKEN
  const fromNumber  = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    // Twilio not yet configured — log and fall back to in-app notification
    console.warn(`[SMS] Twilio not configured. Skipping SMS to ${to}. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to enable.`)
    return { sent: false, reason: 'not_configured' }
  }

  try {
    // TWILIO_FROM_NUMBER can be either a phone number (+1...) or a
    // Messaging Service SID (MG...). Use the correct Twilio param for each.
    const params: Record<string, string> = { To: to, Body: body }
    if (fromNumber.startsWith('MG')) {
      params['MessagingServiceSid'] = fromNumber
    } else {
      params['From'] = fromNumber
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
      }
    )
    if (res.ok) return { sent: true, reason: 'sent' }
    const text = await res.text()
    return { sent: false, reason: 'failed', error: text }
  } catch (err: any) {
    return { sent: false, reason: 'failed', error: err?.message ?? 'unknown' }
  }
}
