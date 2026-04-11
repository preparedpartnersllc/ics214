import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST /api/admin/set-temp-password
//
// Body (JSON):
//   { userId: string, password?: string }
//
// If `password` is provided: sets the user's password to that value and marks
//   must_reset_password = true (admin-issued temp password, reset required on login).
// If `password` is omitted: only marks must_reset_password = true (force reset on
//   next login without changing the current password).
//
// Handles both cases:
//   - Auth user already exists → updateUserById
//   - Profile exists but no auth user → create auth user via GoTrue REST API
//     using the same UUID so the FK relationship is preserved
export async function POST(request: Request) {
  // Verify caller is an authenticated admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!callerProfile || callerProfile.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await request.json()
  const { userId, password } = body as { userId?: string; password?: string }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  if (password !== undefined && password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Use service role for privileged auth operations
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch the target profile so we have email for auth-user creation
  const { data: targetProfile, error: profileFetchErr } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single()

  if (profileFetchErr || !targetProfile) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  if (!targetProfile.email) {
    return NextResponse.json(
      { error: 'This person has no email address on record. Add an email before setting a password.' },
      { status: 400 }
    )
  }

  // Try to update the existing auth user first
  let authUserExists = true

  if (password) {
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password })
    if (pwErr) {
      if (pwErr.message.toLowerCase().includes('not found') || pwErr.status === 404) {
        authUserExists = false
      } else {
        return NextResponse.json({ error: pwErr.message }, { status: 400 })
      }
    }
  } else {
    // No password change — just probe whether the auth user exists
    const { error: probeErr } = await admin.auth.admin.getUserById(userId)
    if (probeErr) {
      if (probeErr.message.toLowerCase().includes('not found') || probeErr.status === 404) {
        authUserExists = false
      } else {
        return NextResponse.json({ error: probeErr.message }, { status: 400 })
      }
    }
  }

  // Auth user doesn't exist yet — create one using the same UUID
  if (!authUserExists) {
    if (!password) {
      return NextResponse.json(
        { error: 'A password is required to activate this account for the first time.' },
        { status: 400 }
      )
    }

    // GoTrue admin REST endpoint allows specifying the exact ID
    const createRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({
          id: userId,
          email: targetProfile.email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: targetProfile.full_name ?? '',
          },
        }),
      }
    )

    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}))
      const msg = (errBody as { msg?: string; message?: string }).msg
        ?? (errBody as { msg?: string; message?: string }).message
        ?? 'Failed to create auth account'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  // Set must_reset_password in auth metadata (read by middleware from JWT)
  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { must_reset_password: true },
  })
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 400 })

  // Set must_reset_password in profiles table (used by login action fallback)
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ must_reset_password: true })
    .eq('id', userId)
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
