import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST /api/admin/delete-account
// Body: { userId: string }
//
// Deletes the Supabase auth user (which cascades to the profiles row via FK).
// Caller must be an authenticated admin.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!callerProfile || callerProfile.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { userId } = await request.json() as { userId: string }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Prevent an admin from deleting their own account via this route
  if (userId === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Delete profile row first (in case FK isn't CASCADE)
  await admin.from('profiles').delete().eq('id', userId)

  // Delete the auth user — treat "user not found" as success since the
  // profile is already gone; the accounts are just out of sync.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    const notFound =
      error.message.toLowerCase().includes('not found') ||
      error.message.toLowerCase().includes('does not exist') ||
      (error as any).status === 404
    if (!notFound) {
      console.error('[delete-account]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Auth user was already gone — profile cleanup above is sufficient
  }

  return NextResponse.json({ success: true })
}
