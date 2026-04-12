import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'

// POST /api/admin/sms-invite
//
// Body (JSON): { userId: string }
//
// Looks up the person's profile, reads phone_normalized (E.164),
// and sends an SMS invite via the configured provider (Twilio).
// Returns { success: true } or { error: string }.
export async function POST(request: Request) {
  // ── Verify caller is an authenticated admin ──────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!callerProfile || callerProfile.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  const { userId } = await request.json() as { userId?: string }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // ── Look up target profile (service role so we can read any profile) ─────
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('full_name, email, phone_normalized, phone')
    .eq('id', userId)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
  }

  // phone_normalized is E.164 (required by Twilio); phone is display format.
  // We require E.164 for reliable delivery.
  const to = profile.phone_normalized as string | null
  if (!to) {
    return NextResponse.json(
      { error: 'This person has no verified phone number on record. Add a phone number first.' },
      { status: 400 }
    )
  }

  // ── Build message ─────────────────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ics214.vercel.app'
  const name    = profile.full_name ? `Hi ${profile.full_name.split(' ')[0]}, ` : ''
  const message = [
    `${name}you've been invited to Command OS — Detroit Fire Department.`,
    ``,
    `Sign in or create your account:`,
    `${siteUrl}/login`,
    ``,
    `Contact your incident administrator if you need help.`,
  ].join('\n')

  // ── Send ──────────────────────────────────────────────────────────────────
  const result = await sendSMS(to, message)
  console.log('[sms-invite]', { userId, to, result })

  if (result.sent) {
    return NextResponse.json({ success: true })
  }

  if (result.reason === 'not_configured') {
    return NextResponse.json(
      { error: 'SMS is not configured on this server. Ask your administrator to add Twilio credentials.' },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { error: 'Could not send text message. Please try again or use email invite.' },
    { status: 400 }
  )
}
