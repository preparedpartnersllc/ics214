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
// Both operations also update auth user_metadata so middleware can gate without
// an extra DB call.
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

  // Use service role for privileged auth operations
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Optionally update the password
  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password })
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 400 })
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
