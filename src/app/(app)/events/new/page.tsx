'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import Link from 'next/link'

const schema = z.object({
  name:            z.string().min(2, 'Event name is required'),
  incident_number: z.string().optional(),
  location:        z.string().optional(),
  summary:         z.string().optional(),
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
        name:            data.name,
        incident_number: data.incident_number || null,
        location:        data.location || null,
        summary:         data.summary || null,
        created_by:      user.id,
      })
      .select()
      .single()

    if (err) { setError(err.message); return }
    router.push(`/events/${event.id}`)
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        <div className="px-4 py-2.5 max-w-2xl mx-auto flex items-center justify-between gap-4">
          <Link href="/events"
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Events
          </Link>
          <p className="text-sm font-semibold text-[#E5E7EB]">New Event</p>
        </div>
      </header>

      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        <p className="text-xs text-[#6B7280] mb-6">
          Operational periods are added after the event is created.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-5 space-y-4">
            <FormField label="Incident / Event Name *" error={errors.name?.message}>
              <input
                type="text"
                className="input"
                placeholder="e.g. 2026 Detroit Auto Show"
                autoFocus
                {...register('name')}
              />
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
              <textarea
                rows={3}
                className="input resize-none"
                placeholder="Brief description of the incident or event…"
                {...register('summary')}
              />
            </FormField>
          </div>

          {error && (
            <p className="text-sm text-[#EF4444] flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Link href="/events">
              <button type="button"
                className="text-[#9CA3AF] border border-[#232B36] px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#161D26] hover:border-[#3a4555] transition-colors">
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.98] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm"
            >
              {isSubmitting ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              )}
              Create Event
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
