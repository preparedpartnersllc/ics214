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

const SET_PW_HTML = (link: string) => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0B0F14;color:#E5E7EB;border-radius:12px">
  <p style="font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#FF5A1F;margin:0 0 16px">Command OS</p>
  <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 12px">Set your password</h1>
  <p style="font-size:14px;color:#9CA3AF;line-height:1.6;margin:0 0 24px">An administrator has set up an account for you on Command OS. Click below to set your password and log in.</p>
  <a href="${link}" style="display:inline-block;background:#FF5A1F;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Set Password</a>
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

  // Look up the inviting admin's agency so we can pre-fill it for the new user
  const { data: adminProfile } = await supabase
    .from('profiles').select('default_agency').eq('id', user.id).single()
  const adminAgency = adminProfile?.default_agency ?? ''

  // Build the redirectTo URL with agency as a query param so set-password can lock it
  const redirectBase = `${siteUrl}/set-password`
  const redirectTo = adminAgency
    ? `${redirectBase}?agency=${encodeURIComponent(adminAgency)}`
    : redirectBase

  // --- Step 1: Check for any existing auth user with this email ---
  // listUsers doesn't support server-side email filter, so we fetch and search.
  // For small user bases this is fine; increase perPage if needed.
  const { data: listData } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existingAuthUser = (listData?.users ?? []).find((u: any) => u.email === email)

  if (existingAuthUser) {
    // Check whether this person has an active profile (i.e. they're a real, live user)
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('is_active')
      .eq('id', existingAuthUser.id)
      .maybeSingle()

    if (existingProfile?.is_active) {
      // Active user — send a "set password" recovery link instead
      const { data: resetData, error: resetErr } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      })
      if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 400 })
      await sendViaResend(email, 'Set your Command OS password', SET_PW_HTML(resetData.properties.action_link))
      return NextResponse.json({ success: true })
    }

    // Stale / soft-deleted / unconfirmed auth user — hard delete so we can re-invite clean
    await adminSupabase.auth.admin.deleteUser(existingAuthUser.id)
  }

  // --- Step 2: Remove any stale profile row for this email ---
  // Handles the case where a profile exists with a different (or deleted) auth user ID.
  await adminSupabase.from('profiles').delete().eq('email', email)

  // --- Step 3: Create a fresh invite ---
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 })
  }

  await sendViaResend(email, 'You have been invited to Command OS', INVITE_HTML(linkData.properties.action_link))
  return NextResponse.json({ success: true })
}
