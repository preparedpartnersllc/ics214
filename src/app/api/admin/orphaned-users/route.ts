import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// GET /api/admin/orphaned-users
// Returns auth users that have no corresponding profile row.
// These are typically invites that were accepted but whose profile was never
// created (e.g. trigger failure). Admins can delete them and re-invite.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 200 })
  const authUsers = authData?.users ?? []

  const { data: profiles } = await supabase.from('profiles').select('id')
  const profileIds = new Set((profiles ?? []).map((p: any) => p.id))

  const orphans = authUsers
    .filter(u => !profileIds.has(u.id))
    .map(u => ({ id: u.id, email: u.email, created_at: u.created_at }))

  return NextResponse.json({ orphans })
}
