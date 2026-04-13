'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type Input = z.infer<typeof schema>

export default function SetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Input>({ resolver: zodResolver(schema) })

  useEffect(() => {
    const supabase = createClient()

    // Parse the hash fragment manually — the invite link carries
    // access_token + refresh_token in the URL hash (#), not as query params.
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setTokenError('Invalid or expired invite link. Please ask an admin to resend your invite.')
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async ({ data, error }) => {
        if (error || !data.user) {
          setTokenError('This invite link has expired or already been used. Please ask an admin to resend your invite.')
          return
        }
        // Clear hash from URL so the token isn't visible / reused
        window.history.replaceState(null, '', window.location.pathname)
        // Ensure a profile row exists — the trigger may have failed if this
        // invite was created before the trigger fix. Upsert is a no-op when
        // the row already exists.
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email ?? '',
          full_name: data.user.user_metadata?.full_name ?? '',
        }, { onConflict: 'id', ignoreDuplicates: true })
        setReady(true)
      })
  }, [])

  async function onSubmit(data: Input) {
    setSubmitError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setSubmitError(error.message)
      return
    }
    // Clear must_reset_password flag if it was set
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ must_reset_password: false }).eq('id', user.id)
    }
    router.push('/dashboard')
  }

  if (tokenError) {
    return (
      <AuthLayout title="Invalid Link" subtitle="Command OS">
        <p className="text-sm text-red-400">{tokenError}</p>
      </AuthLayout>
    )
  }

  if (!ready) {
    return (
      <AuthLayout title="Verifying invite…" subtitle="Command OS">
        <p className="text-sm text-[#9CA3AF]">Please wait…</p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set Your Password" subtitle="Command OS — Detroit Fire Department">
      <p className="text-sm text-[#9CA3AF] mb-5">
        You have been invited to Command OS. Choose a password to activate your account.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            {...register('password')}
          />
        </FormField>
        <FormField label="Confirm Password" error={errors.confirm?.message}>
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            {...register('confirm')}
          />
        </FormField>
        {submitError && <p className="text-sm text-red-400">{submitError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">
          Activate account
        </Button>
      </form>
    </AuthLayout>
  )
}
