'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { HomeButton } from '@/components/ui/HomeButton'
import Link from 'next/link'

const schema = z.object({
  name: z.string().min(2, 'Event name is required'),
  incident_number: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
})

type Input = z.infer<typeof schema>

export default function NewEventPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Input>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Input) {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: event, error: err } = await supabase
      .from('events')
      .insert({
        name: data.name,
        incident_number: data.incident_number || null,
        location: data.location || null,
        summary: data.summary || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (err) { setError(err.message); return }
    router.push(`/events/${event.id}`)
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-xl font-semibold text-zinc-100">New Event</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Operational periods are added after the event is created.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <FormField label="Incident / Event Name *" error={errors.name?.message}>
            <input type="text" className="input"
              placeholder="e.g. 2026 Detroit Auto Show"
              {...register('name')} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Incident #" error={errors.incident_number?.message}>
              <input type="text" className="input" placeholder="Optional"
                {...register('incident_number')} />
            </FormField>
            <FormField label="Location" error={errors.location?.message}>
              <input type="text" className="input" placeholder="Optional"
                {...register('location')} />
            </FormField>
          </div>

          <FormField label="Event Summary" error={errors.summary?.message}>
            <textarea rows={3} className="input resize-none"
              placeholder="Brief description of the incident or event..."
              {...register('summary')} />
          </FormField>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <Link href="/events">
            <button type="button"
              className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
              Cancel
            </button>
          </Link>
          <Button type="submit" loading={isSubmitting}>Create Event</Button>
        </div>
      </form>
    </div>
  )
}