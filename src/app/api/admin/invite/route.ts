import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { email } = await request.json()
  if (!email) return new NextResponse('Missing email', { status: 400 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
  })

  if (error) {
    // User already exists — send a password reset link instead so they can log in
    const alreadyExists = error.message.toLowerCase().includes('already') ||
      error.message.toLowerCase().includes('database error')
    if (alreadyExists) {
      const { error: resetError } = await adminSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
      })
      if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}