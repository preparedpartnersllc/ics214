 'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { register as registerUser } from '@/app/auth/actions'
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
    const result = await registerUser(data)
    if (result?.error) setServerError(result.error)
  }

  return (
    <AuthLayout title="Create Account" subtitle="ICS 214 Activity Log">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Full Name" error={errors.full_name?.message}>
          <input type="text" className="input" {...register('full_name')} />
        </FormField>

        <FormField label="Email" error={errors.email?.message}>
          <input type="email" className="input" {...register('email')} />
        </FormField>

        <FormField label="Password" error={errors.password?.message}>
          <input type="password" className="input" {...register('password')} />
        </FormField>

        <div className="border-t border-zinc-700 pt-4">
          <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-mono">
            ICS Defaults (pre-fills your 214)
          </p>
          <div className="space-y-3">
            <FormField label="Home Agency" error={errors.default_agency?.message}>
              <input type="text"
                placeholder="e.g. Detroit Fire Department"
                className="input" {...register('default_agency')} />
            </FormField>
            <FormField label="Unit" error={errors.default_unit?.message}>
              <input type="text"
                placeholder="e.g. Engine 23"
                className="input" {...register('default_unit')} />
            </FormField>
            <FormField label="ICS Position" error={errors.default_position?.message}>
              <input type="text"
                placeholder="e.g. Fire Inspector Lt."
                className="input" {...register('default_position')} />
            </FormField>
          </div>
        </div>

        {serverError && (
          <p className="text-sm text-red-400 bg-red-950/50 px-3 py-2 rounded">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>

        <p className="text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-600 font-medium">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}