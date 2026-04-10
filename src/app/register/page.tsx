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

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  async function onSubmit(data: RegisterInput) {
    setServerError(null)
    const result = await registerAction(data)
    if (result?.error) setServerError(result.error)
  }

  return (
    <AuthLayout title="Create Account" subtitle="ICS 214 — Detroit Fire Department">
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

        {serverError && (
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
