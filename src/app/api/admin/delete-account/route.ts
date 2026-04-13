import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdminRole, isSuperAdmin } from '@/lib/roles'

// POST /api/admin/delete-account
// Body: { userId: string }
//
// Deletes the Supabase auth user (which cascades to the profiles row via FK).
// Caller must be an authenticated admin or super_admin.
// super_admin accounts cannot be deleted by anyone via this route.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!callerProfile || !isAdminRole(callerProfile.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { userId } = await request.json() as { userId: string }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  if (userId === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Prevent deletion of super_admin accounts
  const { data: targetProfile } = await admin
    .from('profiles').select('role').eq('id', userId).single()
  if (isSuperAdmin(targetProfile?.role)) {
    return NextResponse.json({ error: 'Super admin accounts cannot be deleted.' }, { status: 403 })
  }

  await admin.from('profiles').delete().eq('id', userId)

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
  }

  return NextResponse.json({ success: true })
}
