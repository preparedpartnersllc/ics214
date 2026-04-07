'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: { email: string; password: string }) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(formData)
  if (error) return { error: error.message }
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
    },
  })

  if (error) return { error: error.message }
  if (!data.user) return { error: 'Registration failed' }

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
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function resetPassword(password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/dashboard')
}