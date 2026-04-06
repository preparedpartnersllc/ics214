 'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { login } from '@/app/auth/actions'
import { loginSchema, type LoginInput } from '@/lib/validations'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginInput) {
    setServerError(null)
    const result = await login(data)
    if (result?.error) setServerError(result.error)
  }

  return (
    <AuthLayout title="ICS 214" subtitle="Activity Log System">
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
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>

        <p className="text-center text-sm text-zinc-500">
          No account?{' '}
          <Link href="/register" className="text-orange-600 font-medium">
            Register
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}