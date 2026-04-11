'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  status:          z.enum(['active', 'closed', 'planning']),
})

type Input = z.infer<typeof schema>

export default function EditEventPage() {
  const params  = useParams()
  const router  = useRouter()
  const eventId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<Input>({ resolver: zodResolver(schema) })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('events').select('*').eq('id', eventId).single()
      if (error || !data) { setError('Event not found'); setLoading(false); return }
      reset({
        name:            data.name,
        incident_number: data.incident_number ?? '',
        location:        data.location ?? '',
        summary:         data.summary ?? '',
        status:          data.status ?? 'active',
      })
      setLoading(false)
    }
    load()
  }, [eventId, reset])

  async function onSubmit(data: Input) {
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('events')
      .update({
        name:            data.name,
        incident_number: data.incident_number || null,
        location:        data.location || null,
        summary:         data.summary || null,
        status:          data.status,
      })
      .eq('id', eventId)
    if (err) { setError(err.message); return }
    router.push(`/events/${eventId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
        <p className="text-[#6B7280] text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/events" className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Events
          </Link>
          <span className="text-[#232B36] text-xs">/</span>
          <span className="text-xs text-[#E5E7EB] font-medium">Edit Event</span>
        </div>

        <h1 className="text-lg font-semibold text-[#E5E7EB] mb-1">Edit Event</h1>
        <p className="text-xs text-[#6B7280] mb-6">Changes save immediately on submit.</p>

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

            <FormField label="Status" error={errors.status?.message}>
              <select className="input" {...register('status')}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
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
            <Link href={`/events/${eventId}`}>
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
              Save Changes
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
