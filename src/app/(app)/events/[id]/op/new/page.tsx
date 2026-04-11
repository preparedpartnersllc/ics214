'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { createOperationalPeriodSchema, type CreateOperationalPeriodInput } from '@/lib/validations'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { HomeButton } from '@/components/ui/HomeButton'
import Link from 'next/link'

export default function NewOperationalPeriodPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.id as string
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<CreateOperationalPeriodInput>({
      resolver: zodResolver(createOperationalPeriodSchema)
    })

  async function onSubmit(data: CreateOperationalPeriodInput) {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: existing } = await supabase
      .from('operational_periods')
      .select('period_number')
      .eq('event_id', eventId)
      .order('period_number', { ascending: false })
      .limit(1)

    const nextNumber = existing && existing.length > 0
      ? existing[0].period_number + 1
      : 1

    const { data: op, error: err } = await supabase
      .from('operational_periods')
      .insert({
        event_id: eventId,
        period_number: nextNumber,
        op_period_start: new Date(data.op_period_start).toISOString(),
        op_period_end: new Date(data.op_period_end).toISOString(),
        created_by: user.id,
      })
      .select()
      .single()

    if (err) { setError(err.message); return }
    router.push(`/events/${eventId}/op/${op.id}/stage`)
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-xl font-semibold text-zinc-100">New Operational Period</h1>
        <p className="text-sm text-zinc-500 mt-1">
          After creating the period you will be taken to the Staff screen to build the org structure.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
            Operational Period Date / Time
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date/Time From *" error={errors.op_period_start?.message}>
              <input type="datetime-local" className="input"
                {...register('op_period_start')} />
            </FormField>
            <FormField label="Date/Time To *" error={errors.op_period_end?.message}>
              <input type="datetime-local" className="input"
                {...register('op_period_end')} />
            </FormField>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <Link href={`/events/${eventId}`}>
            <button type="button"
              className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
              Cancel
            </button>
          </Link>
          <Button type="submit" loading={isSubmitting}>
            Create Period → Staff
          </Button>
        </div>
      </form>
    </div>
  )
}