 'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
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

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Input>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Input) {
    setError(null)
    const result = await resetPassword(data.password)
    if (result?.error) setError(result.error)
  }

  return (
    <AuthLayout title="New Password" subtitle="Incident Management Activity Log">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="New Password" error={errors.password?.message}>
          <input type="password" className="input" {...register('password')} />
        </FormField>
        <FormField label="Confirm Password" error={errors.confirm?.message}>
          <input type="password" className="input" {...register('confirm')} />
        </FormField>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">
          Set new password
        </Button>
      </form>
    </AuthLayout>
  )
}