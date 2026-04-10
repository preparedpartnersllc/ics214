import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/sms'

/**
 * POST /api/events/[id]/meetings/notify
 *
 * Sends SMS notifications for a meeting to a set of invitees.
 * Called after meeting creation or after an edit adds new invitees.
 *
 * Body: {
 *   meetingId: string
 *   targetUserIds?: string[]   // if omitted, notifies ALL invitees for the meeting
 * }
 *
 * Returns: { sent, skipped, failed } counts
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { id: eventId } = await params
  const body = await request.json().catch(() => null)
  if (!body?.meetingId) return new NextResponse('Missing meetingId', { status: 400 })

  const { meetingId, targetUserIds } = body as {
    meetingId: string
    targetUserIds?: string[]
  }

  // Load meeting + event name in parallel
  const [{ data: meeting }, { data: event }] = await Promise.all([
    supabase
      .from('event_meetings')
      .select('id, title, start_time, end_time, location')
      .eq('id', meetingId)
      .single(),
    supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single(),
  ])

  if (!meeting) return new NextResponse('Meeting not found', { status: 404 })

  // Resolve which user IDs to notify
  let userIds: string[]
  if (targetUserIds && targetUserIds.length > 0) {
    userIds = targetUserIds
  } else {
    const { data: invitees } = await supabase
      .from('meeting_invitees')
      .select('user_id')
      .eq('meeting_id', meetingId)
    userIds = (invitees ?? []).map((i: any) => i.user_id)
  }

  if (userIds.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0 })
  }

  // Load phone numbers for those users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone_normalized')
    .in('id', userIds)

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p: any) => [p.id, p])
  )

  // Build SMS body
  const startDate = new Date(meeting.start_time)
  const dateStr = startDate.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const locationStr = meeting.location ? ` at ${meeting.location}` : ''
  const eventName = event?.name ? `[${event.name}] ` : ''
  const smsBody = `${eventName}Meeting: "${meeting.title}" — ${dateStr}${locationStr}`

  // Send SMS concurrently, log each result
  let sent = 0, skipped = 0, failed = 0

  await Promise.all(userIds.map(async (uid) => {
    const profile = profileMap[uid]
    const phone = profile?.phone_normalized ?? null

    const result = await sendSMS(phone, smsBody)

    if (result.sent) {
      console.log(`[SMS] Sent to ${profile?.full_name ?? uid} (${phone})`)
      sent++
    } else if (result.reason === 'no_phone') {
      console.log(`[SMS] Skipped ${profile?.full_name ?? uid} — no phone number`)
      skipped++
    } else if (result.reason === 'not_configured') {
      console.log(`[SMS] Skipped ${profile?.full_name ?? uid} — Twilio not configured`)
      skipped++
    } else {
      console.warn(`[SMS] Failed for ${profile?.full_name ?? uid}: ${result.error}`)
      failed++
    }
  }))

  console.log(`[SMS] Meeting "${meeting.title}" → sent=${sent} skipped=${skipped} failed=${failed}`)
  return NextResponse.json({ sent, skipped, failed })
}
