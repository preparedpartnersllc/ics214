import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdminRole } from '@/lib/roles'

const INVITE_HTML = (link: string) => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0B0F14;color:#E5E7EB;border-radius:12px">
  <p style="font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#FF5A1F;margin:0 0 16px">Command OS</p>
  <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 12px">You have been invited</h1>
  <p style="font-size:14px;color:#9CA3AF;line-height:1.6;margin:0 0 24px">An administrator has invited you to join Command OS — the incident management platform for the Detroit Fire Department.</p>
  <a href="${link}" style="display:inline-block;background:#FF5A1F;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Accept Invite</a>
  <p style="font-size:12px;color:#6B7280;margin:24px 0 0">If you did not expect this invitation, you can ignore this email.</p>
</div>
`

async function sendViaResend(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Command OS <noreply@preparedpartnersllc.com>',
      to,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
  return res.json()
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !isAdminRole(profile.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { email } = await request.json()
  if (!email) return new NextResponse('Missing email', { status: 400 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ics214.com'

  // Clean up any stale profile row for this email before creating the invite.
  // This happens when a user was previously deleted: their auth user is gone but
  // a profile row may remain, causing the handle_new_user trigger to conflict.
  const { data: staleProfile } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (staleProfile) {
    // Only remove it if there's no live auth user backing it
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(staleProfile.id)
    if (!authUser?.user) {
      await adminSupabase.from('profiles').delete().eq('id', staleProfile.id)
    }
  }

  // Generate the invite link without relying on Supabase SMTP
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (linkError) {
    // User already exists — send a password reset link instead
    const alreadyExists =
      linkError.message.toLowerCase().includes('already') ||
      linkError.message.toLowerCase().includes('registered')

    if (alreadyExists) {
      const { data: resetData, error: resetLinkError } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/set-password` },
      })
      if (resetLinkError) return NextResponse.json({ error: resetLinkError.message }, { status: 400 })

      await sendViaResend(
        email,
        'Reset your Command OS password',
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0B0F14;color:#E5E7EB;border-radius:12px">
          <p style="font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#FF5A1F;margin:0 0 16px">Command OS</p>
          <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 12px">Set your password</h1>
          <p style="font-size:14px;color:#9CA3AF;line-height:1.6;margin:0 0 24px">An administrator has set up an account for you on Command OS. Click below to set your password and log in.</p>
          <a href="${resetData.properties.action_link}" style="display:inline-block;background:#FF5A1F;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Set Password</a>
        </div>`
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: linkError.message }, { status: 400 })
  }

  await sendViaResend(
    email,
    'You have been invited to Command OS',
    INVITE_HTML(linkData.properties.action_link)
  )

  return NextResponse.json({ success: true })
}
