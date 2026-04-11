'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: { email: string; password: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(formData)
  if (error) return { error: error.message }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, must_reset_password')
    .eq('id', data.user.id)
    .single()

  if (profile?.is_active === false) {
    await supabase.auth.signOut()
    return { error: 'This account has been deactivated. Contact your administrator.' }
  }

  // Admin set a temporary password — force them to choose their own before continuing
  if (profile?.must_reset_password === true) {
    redirect('/reset-password?forced=true')
  }

  redirect('/dashboard')
}

export async function register(formData: {
  full_name: string
  email: string
  password: string
  default_agency?: string
  default_unit?: string
  timezone?: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: { full_name: formData.full_name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    // "Database error saving new user" typically means the email is already
    // registered (auth user exists). Guide the user to sign in instead.
    if (
      msg.includes('database error') ||
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      msg.includes('user already')
    ) {
      return { error: error.message, code: 'email_exists' as const }
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
      return { error: error.message, code: 'rate_limit' as const }
    }
    return { error: error.message, code: 'unknown' as const }
  }

  if (!data.user) return { error: 'Registration failed', code: 'unknown' as const }

  await supabase.from('profiles').update({
    default_agency: formData.default_agency ?? null,
    default_unit: formData.default_unit ?? null,
    timezone: formData.timezone ?? 'America/Detroit',
  }).eq('id', data.user.id)

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function forgotPassword(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function resetPassword(password: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  // Clear the forced-reset flag in both the profile row and auth metadata
  if (user) {
    await supabase
      .from('profiles')
      .update({ must_reset_password: false })
      .eq('id', user.id)
    await supabase.auth.updateUser({ data: { must_reset_password: false } })
  }

  redirect('/dashboard')
}
