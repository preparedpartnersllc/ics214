import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const isPublic = pathname.startsWith('/login')
    || pathname.startsWith('/register')
    || pathname.startsWith('/auth')
    || pathname.startsWith('/reset-password')
    || pathname.startsWith('/terms')
    || pathname.startsWith('/privacy')
    || pathname === '/'

  // Unauthenticated: redirect to login for any protected route
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated: if must_reset_password is set in auth metadata, gate all
  // non-public routes (except reset-password itself) to force the reset.
  // user_metadata is in the JWT so no extra DB call is needed here.
  if (user && !isPublic) {
    const needsReset = user.user_metadata?.must_reset_password === true
    if (needsReset) {
      const url = request.nextUrl.clone()
      url.pathname = '/reset-password'
      url.searchParams.set('forced', 'true')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
