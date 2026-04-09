'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSDateTime, getInitials } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import { HomeButton } from '@/components/ui/HomeButton'
import Link from 'next/link'

export default function ReviewPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [event, setEvent] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<any>({})

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: e }, { data: o }, { data: a }, { data: t }, { data: ents }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
      supabase.from('activity_entries').select('*').eq('operational_period_id', opId).order('entry_time'),
    ])

    setEvent(e)
    setOp(o)
    setAssignments(a ?? [])
    setTeams(t ?? [])
    setEntries(ents ?? [])

    const userIds = (a ?? []).map((x: any) => x.user_id)
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds)
      const map = (profs ?? []).reduce((acc: any, prof: any) => {
        acc[prof.id] = prof; return acc
      }, {})
      setProfileMap(map)
    }
  }

  if (!op) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B0F14] px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-1">
          Activity Review
        </p>
        <h1 className="text-xl font-semibold text-[#E5E7EB]">{event?.name}</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          OP {op.period_number} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      <div className="space-y-6">
        {assignments.map(assignment => {
          const p = profileMap[assignment.user_id]
          const team = teams.find(t => t.id === assignment.team_id)
          const userEntries = entries.filter(e => e.user_id === assignment.user_id)

          return (
            <div key={assignment.id} className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#232B36]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF]">
                    {getInitials(p?.full_name ?? '?')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#E5E7EB]">{p?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-[#6B7280]">
                      {getPositionLabel(assignment.ics_position)} · {team?.name}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[#6B7280]">{userEntries.length} {userEntries.length === 1 ? 'entry' : 'entries'}</span>
              </div>

              {userEntries.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[#6B7280]">No entries logged.</p>
              ) : (
                <div className="divide-y divide-[#232B36]">
                  {userEntries.map(entry => (
                    <div key={entry.id} className="px-4 py-3">
                      <p className="text-xs font-mono text-[#FF5A1F] mb-1">
                        {formatICSDateTime(entry.entry_time)}
                      </p>
                      <p className="text-sm text-[#E5E7EB] leading-relaxed">{entry.narrative}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {assignments.length === 0 && (
          <p className="text-center text-[#6B7280] py-12 text-sm">No personnel assigned to this period.</p>
        )}
      </div>

      <div className="mt-6">
        <Link href={`/events/${eventId}`} className="text-sm text-[#6B7280] hover:text-[#9CA3AF]">
          ← Back to Event
        </Link>
      </div>
    </div>
  )
}
