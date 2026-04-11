'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { register as registerAction } from '@/app/auth/actions'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

type ErrorCode = 'email_exists' | 'rate_limit' | 'unknown' | null

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [errorCode,   setErrorCode]   = useState<ErrorCode>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

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
    <AuthLayout title="Create Account" subtitle="Command OS — Detroit Fire Department">
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

        <FormField label="Agency (optional)" error={errors.default_agency?.message}>
          <input
            type="text"
            autoComplete="organization"
            className="input"
            placeholder="Detroit Fire Department"
            {...register('default_agency')}
          />
        </FormField>

        <FormField label="Unit (optional)" error={errors.default_unit?.message}>
          <input
            type="text"
            className="input"
            placeholder="Engine 1"
            {...register('default_unit')}
          />
        </FormField>

        {/* ── Error + recovery UI ── */}
        {serverError && errorCode === 'email_exists' && (
          <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-[#F59E0B]">
              This email may already have an account.
            </p>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/login"
                  className="flex items-center gap-2 text-sm text-[#E5E7EB] hover:text-white transition-colors"
                >
                  <span className="text-[#22C55E]">→</span> Sign in with your existing password
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="flex items-center gap-2 text-sm text-[#E5E7EB] hover:text-white transition-colors"
                  onClick={() => {
                    // Pass a hint so the login page can pre-open the forgot form
                    sessionStorage?.setItem('open_forgot', '1')
                  }}
                >
                  <span className="text-[#3B82F6]">→</span> Reset your password via email
                </Link>
              </li>
            </ul>
            <p className="text-xs text-[#6B7280] border-t border-[#232B36] pt-2">
              If an admin created your account, sign in with the temporary password they gave you.
              Then you will be prompted to set your own password.
            </p>
            <p className="text-xs text-[#4B5563]">
              Still stuck? Contact your administrator.
            </p>
          </div>
        )}

        {serverError && errorCode === 'rate_limit' && (
          <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-3">
            <p className="text-sm text-[#EF4444]">
              Too many attempts. Please wait a moment and try again.
            </p>
          </div>
        )}

        {serverError && errorCode === 'unknown' && (
          <p className="text-sm text-red-400">{serverError}</p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>

        <p className="text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-600 font-medium">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
