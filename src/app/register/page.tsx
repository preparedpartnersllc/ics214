'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { register as registerAction } from '@/app/auth/actions'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

type ErrorCode = 'email_exists' | 'rate_limit' | 'profile_save_failed' | 'unknown' | null

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [errorCode,   setErrorCode]   = useState<ErrorCode>(null)
  const [agencies,    setAgencies]    = useState<string[]>([])

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  useEffect(() => {
    createClient()
      .from('agencies')
      .select('name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setAgencies((data ?? []).map((a: any) => a.name)))
  }, [])

  async function onSubmit(data: RegisterInput) {
    setServerError(null)
    setErrorCode(null)
    const result = await registerAction(data)
    if (result?.error) {
      setServerError(result.error)
      setErrorCode((result.code as ErrorCode) ?? 'unknown')
    }
  }

  return (
    <AuthLayout title="Create Account" subtitle="Command OS">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Full Name" error={errors.full_name?.message}>
          <input
            type="text"
            autoComplete="name"
            className="input"
            placeholder="John Smith"
            {...register('full_name')}
          />
        </FormField>

        <FormField label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            className="input"
            placeholder="you@example.com"
            {...register('email')}
          />
        </FormField>

        <FormField label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            {...register('password')}
          />
        </FormField>

        <FormField label="Agency" error={errors.default_agency?.message}>
          <select className="input" {...register('default_agency')} defaultValue="">
            <option value="" disabled>Select your agency…</option>
            {agencies.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {agencies.length === 0 && (
            <p className="text-xs text-[#6B7280] mt-1">Loading agencies…</p>
          )}
        </FormField>

        <FormField label="Unit (optional)" error={errors.default_unit?.message}>
          <input
            type="text"
            className="input"
            placeholder="Engine 1"
            {...register('default_unit')}
          />
        </FormField>

        {/* -- Error + recovery UI -- */}

        {serverError && errorCode === 'email_exists' && (
          <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-[#F59E0B]">
              This email already has an account.
            </p>
            <ul className="space-y-2">
              <li>
                <Link href="/login" className="flex items-center gap-2 text-sm text-[#E5E7EB] hover:text-white transition-colors">
                  <span className="text-[#22C55E]">→</span> Sign in with your existing password
                </Link>
              </li>
              <li>
                <Link href="/login" className="flex items-center gap-2 text-sm text-[#E5E7EB] hover:text-white transition-colors"
                  onClick={() => sessionStorage?.setItem('open_forgot', '1')}>
                  <span className="text-[#3B82F6]">→</span> Reset your password via email
                </Link>
              </li>
            </ul>
            <p className="text-xs text-[#6B7280] border-t border-[#232B36] pt-2">
              If an admin created your account, sign in with the temporary password they gave you.
            </p>
          </div>
        )}

        {serverError && errorCode === 'profile_save_failed' && (
          <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-[#F59E0B]">Account setup incomplete</p>
            <p className="text-xs text-[#9CA3AF]">
              Your login account may have been created, but your profile setup did not finish.
              Try signing in — if that works you're all set.
            </p>
            <Link href="/login" className="flex items-center gap-2 text-sm text-[#E5E7EB] hover:text-white transition-colors pt-1">
              <span className="text-[#22C55E]">→</span> Try signing in
            </Link>
          </div>
        )}

        {serverError && errorCode === 'rate_limit' && (
          <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-3">
            <p className="text-sm text-[#EF4444]">Too many attempts. Please wait a moment and try again.</p>
          </div>
        )}

        {serverError && errorCode === 'unknown' && (
          <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-3">
            <p className="text-sm text-[#EF4444]">
              We couldn't finish creating your account. Please try again or contact your administrator.
            </p>
          </div>
        )}

        {/* Pending approval notice shown after successful submit */}
        {!serverError && isSubmitting === false && (
          null // form handles redirect; pending notice shown post-login
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>

        <p className="text-xs text-[#6B7280] text-center">
          Your account will be reviewed by an administrator before you can access the system.
        </p>

        <p className="text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-600 font-medium">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
