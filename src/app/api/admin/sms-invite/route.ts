import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { normalizePhone } from '@/lib/phone'

// POST /api/admin/sms-invite
//
// Body (JSON): { userId: string } | { phone: string }
//
//   userId — looks up the person's profile to get phone_normalized and
//             personalizes the message with their first name.
//   phone  — sends directly to the supplied number (any common US format
//             or E.164); no profile required. Used for the quick-invite form.
//
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

  const body = await request.json() as { userId?: string; phone?: string }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ics214.vercel.app'

  let to: string
  let firstName = ''

  if (body.userId) {
    // ── Profile-based invite ─────────────────────────────────────────────
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('full_name, phone_normalized, phone')
      .eq('id', body.userId)
      .single()

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const resolved = profile.phone_normalized as string | null
    if (!resolved) {
      return NextResponse.json(
        { error: 'This person has no verified phone number on record.' },
        { status: 400 }
      )
    }
    to = resolved
    firstName = profile.full_name?.split(' ')[0] ?? ''

  } else if (body.phone) {
    // ── Direct phone number invite ───────────────────────────────────────
    const normalized = normalizePhone(body.phone)
    if (!normalized) {
      return NextResponse.json(
        { error: 'Enter a valid 10-digit US number or include + for international.' },
        { status: 400 }
      )
    }
    to = normalized

  } else {
    return NextResponse.json({ error: 'userId or phone required' }, { status: 400 })
  }

  // ── Build message ─────────────────────────────────────────────────────────
  const greeting = firstName ? `Hi ${firstName}, ` : ''
  const message = [
    `${greeting}you've been invited to Command OS — Detroit Fire Department.`,
    ``,
    `Sign in or create your account:`,
    `${siteUrl}/login`,
    ``,
    `Contact your incident administrator if you need help.`,
  ].join('\n')

  // ── Send ──────────────────────────────────────────────────────────────────
  const result = await sendSMS(to, message)
  console.log('[sms-invite]', { userId: body.userId, phone: body.phone, to, result })

  if (result.sent) return NextResponse.json({ success: true })

  if (result.reason === 'not_configured') {
    return NextResponse.json(
      { error: 'SMS is not configured on this server. Contact your administrator.' },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { error: 'Could not send text message. Please try again.' },
    { status: 400 }
  )
}
