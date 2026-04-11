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
    console.error('[register] signUp error:', error.message, '| email:', formData.email)

    // Explicit duplicate-email signals from GoTrue (email confirmation disabled path)
    if (
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      msg.includes('user already')
    ) {
      return { error: error.message, code: 'email_exists' as const }
    }

    // Rate limiting
    if (msg.includes('rate limit') || msg.includes('too many')) {
      return { error: error.message, code: 'rate_limit' as const }
    }

    // "Database error saving new user" fires when the handle_new_user trigger
    // fails — this is a server-side profile/trigger failure, NOT a duplicate
    // email. Do NOT map this to email_exists. The auth user may or may not have
    // been created; instruct the user to try signing in first, then retry.
    if (msg.includes('database error')) {
      console.error('[register] handle_new_user trigger failure for email:', formData.email)
      return { error: error.message, code: 'profile_save_failed' as const }
    }

    return { error: error.message, code: 'unknown' as const }
  }

  // ── Silent duplicate detection ────────────────────────────────────────────
  // When email confirmation is enabled Supabase returns a fake success with
  // identities: [] instead of an error (prevents email enumeration). Detect
  // this and show the real recovery UI.
  if (data.user?.identities?.length === 0) {
    console.error('[register] silent duplicate detected for email:', formData.email)
    return {
      error: 'An account with this email already exists.',
      code: 'email_exists' as const,
    }
  }

  if (!data.user) {
    console.error('[register] signUp returned no user and no error for email:', formData.email)
    return { error: 'Registration failed. Please try again.', code: 'unknown' as const }
  }

  // ── Complete profile setup ─────────────────────────────────────────────────
  // handle_new_user trigger created the profile row on auth.users INSERT.
  // Now fill in the optional fields the trigger doesn't know about.
  const { error: profileErr } = await supabase.from('profiles').update({
    default_agency: formData.default_agency ?? null,
    default_unit: formData.default_unit ?? null,
    timezone: formData.timezone ?? 'America/Detroit',
  }).eq('id', data.user.id)

  if (profileErr) {
    // Auth user was created successfully. Profile extras are non-blocking —
    // the user can update them later. Log it but don't strand them.
    console.error('[register] profile update failed for user:', data.user.id, '|', profileErr.message)
  }

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
