import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatICSDateTime } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import { HomeButton } from '@/components/ui/HomeButton'

export const dynamic = 'force-dynamic'

export default async function MemberLogPage({
  params
}: {
  params: Promise<{ id: string; opId: string; userId: string }>
}) {
  const { id: eventId, opId, userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: event }, { data: op }, { data: memberProfile }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('operational_periods').select('*').eq('id', opId).single(),
    supabase.from('profiles').select('*').eq('id', userId).single(),
  ])

  if (!event || !op || !memberProfile) notFound()

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('operational_period_id', opId)
    .eq('user_id', userId)
    .single()

  if (!assignment) notFound()

  const { data: team } = await supabase
    .from('teams').select('*').eq('id', assignment.team_id).single()

  const { data: entries } = await supabase
    .from('activity_entries')
    .select('*')
    .eq('assignment_id', assignment.id)
    .order('entry_time', { ascending: true })

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-5">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">
          ICS 214 — View Only
        </p>
        <h1 className="text-lg font-semibold text-zinc-100">{memberProfile.full_name}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {event.name} · OP {op.period_number}
        </p>
      </div>

      {/* Personnel info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-zinc-600 font-mono">ICS Position</p>
          <p className="text-sm text-zinc-200">{getPositionLabel(assignment.ics_position)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600 font-mono">Team</p>
          <p className="text-sm text-zinc-200">{team?.name}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600 font-mono">Agency</p>
          <p className="text-sm text-zinc-200">{assignment.home_agency}</p>
        </div>
        {assignment.home_unit && (
          <div>
            <p className="text-xs text-zinc-600 font-mono">Unit</p>
            <p className="text-sm text-zinc-200">{assignment.home_unit}</p>
          </div>
        )}
      </div>

      {/* Entries */}
      <div className="mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">
          Activity Log ({entries?.length ?? 0} entries)
        </p>

        <div className="space-y-2">
          {(entries ?? []).length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-6 text-center">
              <p className="text-sm text-zinc-600">No entries logged yet.</p>
            </div>
          )}

          {(entries ?? []).map((entry: any) => (
            <div key={entry.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs font-mono text-orange-400 mb-1">
                {formatICSDateTime(entry.entry_time)}
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed">{entry.narrative}</p>
              {entry.reviewed && (
                <p className="text-xs text-green-500 mt-1">✓ Reviewed</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Link
          href={`/api/events/${eventId}/op/${opId}/export/${userId}`}
          className="inline-block bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
        >
          Export this 214
        </Link>

        <div>
          <Link href={`/events/${eventId}`} className="text-sm text-zinc-600 hover:text-zinc-400">
            ← Back to Event
          </Link>
        </div>
      </div>
    </div>
  )
}