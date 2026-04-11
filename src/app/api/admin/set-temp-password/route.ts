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
//   1. Fetch profile row to get email (validates person exists in app)
//   2. Explicitly probe auth.users via getUserById (no message-text inference)
//   3a. Auth user EXISTS:
//       - Single updateUserById call: sets password (if provided) + must_reset_password
//         metadata together — avoids two-call sequencing failures
//   3b. Auth user MISSING:
//       - GoTrue REST create with same UUID, password, AND must_reset_password
//         baked into user_metadata at creation time — no follow-up update needed
//   4. Update profiles.must_reset_password = true  (authoritative DB flag,
//      checked by login action as fallback when JWT is stale)
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

  // ── Service-role client ──────────────────────────────────────────────────
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Step 1: fetch profile (validates person exists; need email) ──────────
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

  // ── Step 2: explicitly probe auth user existence ─────────────────────────
  // getUserById returns { data: { user: User | null }, error } with no error
  // when the user simply doesn't exist — data.user is just null.
  const { data: authLookup } = await admin.auth.admin.getUserById(userId)
  const authUserExists = authLookup?.user != null

  // ── Step 3a: auth user exists — single combined update ───────────────────
  // Combine password + user_metadata into ONE updateUserById call so there is
  // no second round-trip that could fail after the first succeeds.
  if (authUserExists) {
    const patch: Record<string, unknown> = {
      user_metadata: { must_reset_password: true },
    }
    if (password) patch.password = password

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, patch)
    if (updateErr) {
      console.error('[set-temp-password] updateUserById failed:', updateErr.message)
      return NextResponse.json(
        { error: 'Failed to update the account. Please try again.' },
        { status: 400 }
      )
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

    // GoTrue accepts an explicit `id` → auth row gets the same UUID as the
    // profile row, preserving all FK relationships.
    // must_reset_password is included in user_metadata at creation time so
    // there is no follow-up update call that could race.
    // The handle_new_user trigger uses ON CONFLICT (id) DO NOTHING so the
    // existing profile row is untouched.
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
          user_metadata: {
            full_name: targetProfile.full_name ?? '',
            must_reset_password: true,
          },
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

      // Duplicate-key means the auth user was created between our probe and
      // now (race condition). The account exists — continue to flag update.
      if (
        !raw.toLowerCase().includes('duplicate key') &&
        !raw.toLowerCase().includes('already exists')
      ) {
        return NextResponse.json(
          { error: 'Failed to create auth account. Please try again.' },
          { status: 400 }
        )
      }

      // Race: auth user now exists — set the metadata flag via update
      const { error: raceUpdateErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { must_reset_password: true },
      })
      if (raceUpdateErr) {
        console.error('[set-temp-password] race updateUserById failed:', raceUpdateErr.message)
        return NextResponse.json(
          { error: 'Failed to update the account. Please try again.' },
          { status: 400 }
        )
      }
    }
  }

  // ── Step 4: set flag in profiles table ───────────────────────────────────
  // This is the authoritative flag checked by the login action.
  // The auth metadata above is checked by middleware (faster, no DB hit).
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ must_reset_password: true })
    .eq('id', userId)

  if (profileErr) {
    console.error('[set-temp-password] profiles update failed:', profileErr.message)
    return NextResponse.json(
      {
        error:
          'Temporary password was set but the reset flag could not be saved. ' +
          'Please contact support.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
