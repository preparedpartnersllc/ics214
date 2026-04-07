'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { activityEntrySchema, type ActivityEntryInput } from '@/lib/validations'
import { formatICSDateTime } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function LogPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [event, setEvent] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)
  const [team, setTeam] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notAssigned, setNotAssigned] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<ActivityEntryInput>({
      resolver: zodResolver(activityEntrySchema),
      defaultValues: {
        entry_time: new Date().toISOString().slice(0, 16),
        narrative: '',
      }
    })

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: p }, { data: e }, { data: o }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
    ])

    const { data: a } = await supabase
      .from('assignments')
      .select('*')
      .eq('operational_period_id', opId)
      .eq('user_id', user.id)
      .single()

    if (!a) { setNotAssigned(true); return }

    const { data: t } = await supabase
      .from('teams').select('*').eq('id', a.team_id).single()

    const { data: ents } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('assignment_id', a.id)
      .order('entry_time', { ascending: true })

    setProfile(p)
    setEvent(e)
    setOp(o)
    setAssignment(a)
    setTeam(t)
    setEntries(ents ?? [])
  }

  async function onSubmit(data: ActivityEntryInput) {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !assignment) return

    const { data: entry, error: err } = await supabase
      .from('activity_entries')
      .insert({
        operational_period_id: opId,
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
    await supabase.from('activity_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  if (notAssigned) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-zinc-400 mb-4">You are not assigned to this operational period.</p>
        <Link href={`/events/${eventId}`} className="text-orange-500 text-sm">← Back to Event</Link>
      </div>
    </div>
  )

  if (!assignment) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">
          ICS 214 — Activity Log
        </p>
        <h1 className="text-lg font-semibold text-zinc-100 truncate">{event?.name}</h1>
        <p className="text-xs font-mono text-zinc-500 mt-0.5">
          OP {op?.period_number} · {new Date(op?.op_period_start).toLocaleString()} — {new Date(op?.op_period_end).toLocaleString()}
        </p>
      </div>

      {/* Personnel info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-zinc-600 font-mono">Name</p>
          <p className="text-sm text-zinc-200">{profile?.full_name}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600 font-mono">ICS Position</p>
          <p className="text-sm text-zinc-200">{getPositionLabel(assignment.ics_position)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600 font-mono">Agency</p>
          <p className="text-sm text-zinc-200">{assignment.home_agency}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600 font-mono">Team</p>
          <p className="text-sm text-zinc-200">{team?.name}</p>
        </div>
      </div>

      {/* Log Activity form FIRST */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-zinc-900 border border-orange-900/40 rounded-xl p-4 space-y-3 mb-4"
      >
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
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

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Add Entry
        </Button>
      </form>

      {/* Entries below form */}
      <div className="mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">
          Activity Log ({entries.length} entries)
        </p>

        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-6 text-center">
              <p className="text-sm text-zinc-600">No entries yet.</p>
            </div>
          )}

          {entries.map(entry => (
            <div key={entry.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-orange-400 mb-1">
                  {formatICSDateTime(entry.entry_time)}
                </p>
                <p className="text-sm text-zinc-300 leading-relaxed">{entry.narrative}</p>
                {entry.reviewed && (
                  <p className="text-xs text-green-500 mt-1">✓ Reviewed</p>
                )}
              </div>
              {!entry.reviewed && (
                <button
                  onClick={() => deleteEntry(entry.id)}
                  className="flex-shrink-0 text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Link href={`/events/${eventId}`} className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Back to Event
        </Link>
      </div>
    </div>
  )
}