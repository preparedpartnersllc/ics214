'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { login, forgotPassword } from '@/app/auth/actions'
import { loginSchema, type LoginInput, forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const { register: registerForgot, handleSubmit: handleForgotSubmit,
    formState: { errors: forgotErrors, isSubmitting: forgotSubmitting } } =
    useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit(data: LoginInput) {
    setServerError(null)
    const result = await login(data)
    if (result?.error) setServerError(result.error)
  }

  async function onForgot(data: ForgotPasswordInput) {
    const result = await forgotPassword(data.email)
    if (result?.error) setServerError(result.error)
    else setForgotSent(true)
  }

  if (showForgot) {
    return (
      <AuthLayout title="Reset Password" subtitle="Incident Management Activity Log">
        {forgotSent ? (
          <div className="text-center space-y-4">
            <p className="text-green-400 text-sm">Check your email for a reset link.</p>
            <button onClick={() => { setShowForgot(false); setForgotSent(false) }}
              className="text-orange-500 text-sm hover:underline">
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit(onForgot)} className="space-y-4">
            <FormField label="Email" error={forgotErrors.email?.message}>
              <input type="email" className="input" {...registerForgot('email')} />
            </FormField>
            {serverError && (
              <p className="text-sm text-red-400">{serverError}</p>
            )}
            <Button type="submit" loading={forgotSubmitting} className="w-full">
              Send reset link
            </Button>
            <p className="text-center text-sm text-zinc-500">
              <button type="button" onClick={() => setShowForgot(false)}
                className="text-orange-600 font-medium">
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Command OS" subtitle="Detroit Fire Department">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            className="input"
            {...register('email')}
          />
        </FormField>

        <FormField label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            {...register('password')}
          />
        </FormField>

        {serverError && (
          <p className="text-sm text-red-400">{serverError}</p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>

        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            No account?{' '}
            <Link href="/register" className="text-orange-600 font-medium">
              Register
            </Link>
          </p>
          <button type="button" onClick={() => setShowForgot(true)}
            className="text-sm text-zinc-500 hover:text-zinc-300">
            Forgot password?
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}