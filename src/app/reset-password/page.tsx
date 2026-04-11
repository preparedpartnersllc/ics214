'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { resetPassword } from '@/app/auth/actions'
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

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const forced = searchParams.get('forced') === 'true'

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Input>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Input) {
    setError(null)
    const result = await resetPassword(data.password)
    if (result?.error) setError(result.error)
  }

  return (
    <AuthLayout
      title={forced ? 'Set Your Password' : 'New Password'}
      subtitle="Command OS — Detroit Fire Department"
    >
      {forced && (
        <div className="mb-5 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-4 py-3">
          <p className="text-sm font-semibold text-[#F59E0B] mb-1">
            Password reset required
          </p>
          <p className="text-xs text-[#9CA3AF]">
            An administrator set a temporary password for your account.
            You must choose your own password before continuing.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="New Password" error={errors.password?.message}>
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {forced ? 'Set password and continue' : 'Set new password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
