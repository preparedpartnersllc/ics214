import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST /api/admin/set-temp-password
//
// Body (JSON):
//   { userId: string, password?: string }
//
// Safe to call multiple times — idempotent.
//
// Flow:
//   1. Fetch profile row to get email (validates person exists)
//   2. Explicitly check whether an auth user exists via getUserById
//   3a. Auth user EXISTS → update password (if provided) — no insert, no duplicate
//   3b. Auth user MISSING → create via GoTrue REST with the same UUID
//       (handle_new_user trigger uses ON CONFLICT DO NOTHING so the existing
//        profile row is preserved)
//   4. Set must_reset_password in auth metadata + profiles table
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

  // ── Parse and validate body ──────────────────────────────────────────────
  const body = await request.json()
  const { userId, password } = body as { userId?: string; password?: string }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  if (password !== undefined && password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    )
  }

  // ── Service-role client for privileged auth operations ───────────────────
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Step 1: fetch profile (need email; also validates person exists) ──────
  const { data: targetProfile, error: profileFetchErr } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single()

  if (profileFetchErr || !targetProfile) {
    return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
  }

  if (!targetProfile.email) {
    return NextResponse.json(
      {
        error:
          'This person has no email address on record. ' +
          'Add an email before setting a password.',
      },
      { status: 400 }
    )
  }

  // ── Step 2: explicitly check whether an auth user exists ─────────────────
  // Do NOT infer existence from update-error messages — probe directly.
  const { data: existingAuthUser, error: lookupErr } =
    await admin.auth.admin.getUserById(userId)

  // A real lookup failure (network, permissions) should surface as an error.
  // "User not found" returns data: null + error, but we distinguish by checking
  // whether data is present.
  const authUserExists = !lookupErr && existingAuthUser?.user != null

  if (lookupErr && existingAuthUser?.user == null) {
    // Could be a genuine not-found or a lookup error; either way continue —
    // we'll attempt creation below and catch any real infrastructure errors there.
    console.error('[set-temp-password] getUserById error:', lookupErr.message)
  }

  // ── Step 3a: auth user exists — update in place ───────────────────────────
  if (authUserExists) {
    if (password) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password })
      if (pwErr) {
        console.error('[set-temp-password] updateUserById error:', pwErr.message)
        return NextResponse.json(
          { error: 'Failed to update password. Please try again.' },
          { status: 400 }
        )
      }
    }
  } else {
    // ── Step 3b: auth user missing — create with same UUID ──────────────────
    if (!password) {
      return NextResponse.json(
        {
          error:
            'A temporary password is required to activate this account for the first time.',
        },
        { status: 400 }
      )
    }

    // GoTrue admin endpoint accepts an explicit `id` field so the auth row gets
    // the same UUID as the existing profile row. The handle_new_user trigger
    // (updated to ON CONFLICT DO NOTHING) will silently skip re-inserting the
    // profile since it already exists.
    const createRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({
          id: userId,
          email: targetProfile.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: targetProfile.full_name ?? '' },
        }),
      }
    )

    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}))
      const raw =
        (errBody as { msg?: string; message?: string }).msg ??
        (errBody as { msg?: string; message?: string }).message ??
        ''

      console.error('[set-temp-password] GoTrue create error:', raw)

      // Duplicate key means the auth user was created between our probe and
      // now (race). Treat as success — the account exists.
      if (raw.toLowerCase().includes('duplicate key') || raw.toLowerCase().includes('already exists')) {
        // Fall through — set the flag below
      } else {
        return NextResponse.json(
          { error: 'Failed to create auth account. Please try again.' },
          { status: 400 }
        )
      }
    }
  }

  // ── Step 4: set must_reset_password flag ──────────────────────────────────
  // Auth metadata (read by middleware from JWT — no extra DB call on each request)
  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { must_reset_password: true },
  })
  if (metaErr) {
    console.error('[set-temp-password] updateUserById meta error:', metaErr.message)
    return NextResponse.json(
      { error: 'Password was set but failed to mark account for reset. Contact support.' },
      { status: 500 }
    )
  }

  // Profiles table (used by login action as authoritative fallback)
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ must_reset_password: true })
    .eq('id', userId)
  if (profileErr) {
    console.error('[set-temp-password] profiles update error:', profileErr.message)
    return NextResponse.json(
      { error: 'Password was set but profile update failed. Contact support.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
