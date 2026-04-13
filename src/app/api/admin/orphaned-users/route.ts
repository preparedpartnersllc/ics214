import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdminRole } from '@/lib/roles'

// GET /api/admin/orphaned-users
// Returns two sets of broken accounts:
//   auth_only  — auth user exists but no profile row (trigger failure)
//   profile_only — profile row exists but no auth user (manually deleted auth)
// Both can be safely deleted from the People page so admins can re-invite.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!callerProfile || !isAdminRole(callerProfile.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 200 })
  const authUsers = authData?.users ?? []
  const authIds = new Set(authUsers.map(u => u.id))

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
  const allProfiles = profiles ?? []
  const profileIds = new Set(allProfiles.map((p: any) => p.id))

  // Auth user with no profile
  const authOnly = authUsers
    .filter(u => !profileIds.has(u.id))
    .map(u => ({ id: u.id, email: u.email ?? '', label: u.email ?? u.id }))

  // Profile with no auth user (skip placeholder/imported rows that never had auth accounts)
  const profileOnly = allProfiles
    .filter((p: any) => !authIds.has(p.id) && !p.email?.includes('@placeholder.local'))
    .map((p: any) => ({ id: p.id, email: p.email ?? '', label: p.full_name || p.email || p.id }))

  const orphans = [...authOnly, ...profileOnly]

  return NextResponse.json({ orphans })
}
