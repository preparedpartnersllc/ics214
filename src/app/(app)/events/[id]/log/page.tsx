'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { activityEntrySchema, type ActivityEntryInput } from '@/lib/validations'
import { formatICSDateTime } from '@/lib/utils'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function LogPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<ActivityEntryInput>({
      resolver: zodResolver(activityEntrySchema),
      defaultValues: {
        entry_time: new Date().toISOString().slice(0, 16),
        narrative: '',
      }
    })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: p }, { data: e }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('events').select('*').eq('id', eventId).single(),
      ])

      const { data: a } = await supabase
        .from('assignments')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .single()

      if (!a) return

      const { data: ents } = await supabase
        .from('activity_entries')
        .select('*')
        .eq('assignment_id', a.id)
        .order('entry_time', { ascending: true })

      setProfile(p)
      setEvent(e)
      setAssignment(a)
      setEntries(ents ?? [])
    }
    load()
  }, [eventId])

  async function onSubmit(data: ActivityEntryInput) {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !assignment) return

    const { data: entry, error: err } = await supabase
      .from('activity_entries')
      .insert({
        event_id: eventId,
        assignment_id: assignment.id,
        user_id: user.id,
        entry_time: new Date(data.entry_time).toISOString(),
        narrative: data.narrative,
      })
      .select()
      .single()

    if (err) { setError(err.message); return }

    setEntries(prev => [...prev, entry].sort(
      (a, b) => new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime()
    ))
    reset({ entry_time: new Date().toISOString().slice(0, 16), narrative: '' })
  }

  async function deleteEntry(id: string) {
    const supabase = createClient()
    const { error: err } = await supabase
      .from('activity_entries').delete().eq('id', id)
    if (!err) setEntries(prev => prev.filter(e => e.id !== id))
    else setDeleteError(err.message)
  }

  if (!event || !assignment) {
    return (
      <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#9CA3AF] mb-4">
            {!event ? 'Loading...' : 'You are not assigned to this event.'}
          </p>
          <Link href="/events" className="text-[#FF5A1F] text-sm">← Back to Events</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-5">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-1">
          ICS 214 — Activity Log
        </p>
        <h1 className="text-lg font-semibold text-[#E5E7EB] truncate">{event.name}</h1>
      </div>

      <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-4 mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-[#6B7280] font-mono">Name</p>
          <p className="text-sm text-[#E5E7EB]">{profile?.full_name}</p>
        </div>
        <div>
          <p className="text-xs text-[#6B7280] font-mono">ICS Position</p>
          <p className="text-sm text-[#E5E7EB]">{assignment.ics_position}</p>
        </div>
        <div>
          <p className="text-xs text-[#6B7280] font-mono">Agency</p>
          <p className="text-sm text-[#E5E7EB]">{assignment.home_agency}</p>
        </div>
        {assignment.home_unit && (
          <div>
            <p className="text-xs text-[#6B7280] font-mono">Unit</p>
            <p className="text-sm text-[#E5E7EB]">{assignment.home_unit}</p>
          </div>
        )}
      </div>

      <div className="mb-4">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-2">
          Activity Log ({entries.length} entries)
        </p>

        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-6 text-center">
              <p className="text-sm text-[#6B7280]">No entries yet. Log your first activity below.</p>
            </div>
          )}

          {entries.map(entry => (
            <div key={entry.id}
              className="bg-[#161D26] border border-[#232B36] rounded-2xl p-3 flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-[#FF5A1F] mb-1">
                  {formatICSDateTime(entry.entry_time)}
                </p>
                <p className="text-sm text-[#E5E7EB] leading-relaxed">{entry.narrative}</p>
              </div>
              <button
                onClick={() => deleteEntry(entry.id)}
                className="flex-shrink-0 text-[#6B7280] hover:text-[#EF4444] transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {deleteError && <p className="text-xs text-[#EF4444] mt-2">{deleteError}</p>}
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-[#161D26] border border-[#FF5A1F]/20 rounded-2xl p-4 space-y-3"
      >
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">
          Log Activity
        </p>

        <FormField label="Date / Time" error={errors.entry_time?.message}>
          <input
            type="datetime-local"
            className="input font-mono"
            {...register('entry_time')}
          />
        </FormField>

        <FormField label="Notable Activity" error={errors.narrative?.message}>
          <textarea
            rows={3}
            placeholder="Describe what happened, was assigned, completed, or communicated..."
            className="input resize-none"
            {...register('narrative')}
          />
        </FormField>

        {error && <p className="text-sm text-[#EF4444]">{error}</p>}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Add Entry
        </Button>
      </form>

      <div className="mt-4">
        <Link href={`/events/${eventId}`} className="text-sm text-[#6B7280] hover:text-[#9CA3AF]">
          ← Back to Event
        </Link>
      </div>
    </div>
  )
}
