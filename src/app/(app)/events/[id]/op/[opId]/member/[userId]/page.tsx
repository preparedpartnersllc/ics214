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
    <div className="min-h-screen bg-[#0B0F14] px-4 py-6 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-5">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-1">
          ICS 214 — View Only
        </p>
        <h1 className="text-lg font-semibold text-[#E5E7EB]">{memberProfile.full_name}</h1>
        <p className="text-xs text-[#6B7280] mt-0.5">
          {event.name} · OP {op.period_number}
        </p>
      </div>

      <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-4 mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-[#6B7280] font-mono">ICS Position</p>
          <p className="text-sm text-[#E5E7EB]">{getPositionLabel(assignment.ics_position)}</p>
        </div>
        <div>
          <p className="text-xs text-[#6B7280] font-mono">Team</p>
          <p className="text-sm text-[#E5E7EB]">{team?.name}</p>
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
          Activity Log ({entries?.length ?? 0} entries)
        </p>

        <div className="space-y-2">
          {(entries ?? []).length === 0 && (
            <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-6 text-center">
              <p className="text-sm text-[#6B7280]">No entries logged yet.</p>
            </div>
          )}

          {(entries ?? []).map((entry: any) => (
            <div key={entry.id} className="bg-[#161D26] border border-[#232B36] rounded-2xl p-3">
              <p className="text-xs font-mono text-[#FF5A1F] mb-1">
                {formatICSDateTime(entry.entry_time)}
              </p>
              <p className="text-sm text-[#E5E7EB] leading-relaxed">{entry.narrative}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Link
          href={`/api/events/${eventId}/op/${opId}/export/${userId}`}
          className="inline-block bg-transparent text-[#9CA3AF] border border-[#232B36] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#161D26] hover:border-[#3a4555] transition-colors"
        >
          Export this 214
        </Link>

        <div>
          <Link href={`/events/${eventId}`} className="text-sm text-[#6B7280] hover:text-[#9CA3AF]">
            ← Back to Event
          </Link>
        </div>
      </div>
    </div>
  )
}
