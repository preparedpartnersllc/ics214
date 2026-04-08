'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSTime, formatDate, getInitials } from '@/lib/utils'
import { HomeButton } from '@/components/ui/HomeButton'
import Link from 'next/link'

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [event, setEvent] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [ops, setOps] = useState<any[]>([])
  const [divisions, setDivisions] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<any>({})
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)  // ← FIXED

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)  // ← FIXED: store just the ID string

    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('events').select('*').eq('id', id).single(),
    ])

    setProfile(p)
    setEvent(e)

    const { data: opData } = await supabase
      .from('operational_periods')
      .select('*')
      .eq('event_id', id)
      .order('period_number')

    setOps(opData ?? [])

    const opIds = (opData ?? []).map((o: any) => o.id)
    if (opIds.length === 0) return

    const [{ data: divData }, { data: grpData }, { data: teamData }, { data: aData }] =
      await Promise.all([
        supabase.from('divisions').select('*').in('operational_period_id', opIds),
        supabase.from('groups').select('*').in('operational_period_id', opIds),
        supabase.from('teams').select('*').in('operational_period_id', opIds),
        supabase.from('assignments').select('*').in('operational_period_id', opIds),
      ])

    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])
    setAssignments(aData ?? [])

    const userIds = [...new Set((aData ?? []).map((a: any) => a.user_id))]
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds)
      const map = (profs ?? []).reduce((acc: any, prof: any) => {
        acc[prof.id] = prof; return acc
      }, {})
      setProfileMap(map)
    }
  }

  function toggleOp(opId: string) {
    setExpandedOps(prev => {
      const next = new Set(prev)
      next.has(opId) ? next.delete(opId) : next.add(opId)
      return next
    })
  }

  async function closeEvent() {
    const supabase = createClient()
    await supabase.from('events').update({ status: 'closed' }).eq('id', id)
    setEvent((prev: any) => ({ ...prev, status: 'closed' }))
    setConfirming(null)
    router.push('/dashboard')
  }

  async function reopenEvent() {
    const supabase = createClient()
    await supabase.from('events').update({ status: 'active' }).eq('id', id)
    setEvent((prev: any) => ({ ...prev, status: 'active' }))
    setConfirming(null)
  }

  async function closeOP(opId: string) {
    const supabase = createClient()
    await supabase.from('operational_periods').update({ status: 'closed' }).eq('id', opId)
    setOps(prev => prev.map(op => op.id === opId ? { ...op, status: 'closed' } : op))
    setConfirming(null)
    router.push('/dashboard')
  }

  async function reopenOP(opId: string) {
    const supabase = createClient()
    await supabase.from('operational_periods').update({ status: 'active' }).eq('id', opId)
    setOps(prev => prev.map(op => op.id === opId ? { ...op, status: 'active' } : op))
    setConfirming(null)
  }

  if (!event) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-3xl mx-auto">
      <HomeButton />

      {confirming && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full">
            <p className="text-zinc-100 font-medium mb-2">Are you sure?</p>
            <p className="text-zinc-400 text-sm mb-6">
              {confirming === 'close-event'
                ? 'This will close the entire event. You can reopen it later.'
                : confirming.startsWith('close-op-')
                ? 'This will demobilize this operational period. You can reopen it later.'
                : confirming === 'reopen-event'
                ? 'This will reopen the event.'
                : 'This will reopen this operational period.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (confirming === 'close-event') closeEvent()
                  else if (confirming === 'reopen-event') reopenEvent()
                  else if (confirming.startsWith('close-op-')) closeOP(confirming.replace('close-op-', ''))
                  else if (confirming.startsWith('reopen-op-')) reopenOP(confirming.replace('reopen-op-', ''))
                }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="flex-1 bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ring-1 ring-inset ${
            event.status === 'active'
              ? 'bg-green-500/10 text-green-400 ring-green-500/20'
              : event.status === 'closed'
              ? 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20'
              : 'bg-zinc-500/10 text-zinc-500 ring-zinc-700/30'
          }`}>
            {event.status}
          </span>
          {event.incident_number && (
            <span className="text-xs font-mono text-zinc-500">#{event.incident_number}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">{event.name}</h1>
        {event.location && <p className="text-sm text-zinc-500 mt-1">{event.location}</p>}
        {event.summary && (
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed border-l-2 border-zinc-700 pl-3">
            {event.summary}
          </p>
        )}
      </div>

      {profile?.role === 'admin' && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <Link href={`/events/${id}/op/new`}
            className="inline-flex items-center gap-1.5 bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 hover:border-zinc-600 transition-all">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Operational Period
          </Link>
          <Link href={`/api/events/${id}/export`}
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 hover:border-zinc-600 transition-all">
            Export All
          </Link>
          {event.status === 'active' ? (
            <button
              onClick={() => setConfirming('close-event')}
              className="bg-red-950/40 text-red-400 border border-red-900/60 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-950/70 transition-all">
              Close Event
            </button>
          ) : (
            <button
              onClick={() => setConfirming('reopen-event')}
              className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-all">
              Reopen Event
            </button>
          )}
        </div>
      )}

      {ops.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-8 text-center">
          <p className="text-zinc-600 text-sm">No operational periods yet.</p>
          {profile?.role === 'admin' && (
            <Link href={`/events/${id}/op/new`}
              className="inline-block mt-3 text-orange-500 text-sm hover:underline">
              Create first operational period →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {ops.map((op: any) => {
            const isExpanded = expandedOps.has(op.id)
            const opDivisions = divisions.filter((d: any) => d.operational_period_id === op.id)
            const opAssignments = assignments.filter((a: any) => a.operational_period_id === op.id)
            const opTeams = teams.filter((t: any) => t.operational_period_id === op.id)
            const opGroups = groups.filter((g: any) => g.operational_period_id === op.id)
            const myOpAssignment = opAssignments.find((a: any) => a.user_id === currentUserId)  // ← FIXED

            return (
              <div key={op.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => toggleOp(op.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 flex-shrink-0 transition-all"
                    >
                      <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-zinc-200">Operational Period {op.period_number}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
                          op.status === 'active'
                            ? 'bg-green-500/10 text-green-400 ring-green-500/20'
                            : 'bg-zinc-500/10 text-zinc-500 ring-zinc-700/30'
                        }`}>
                          {op.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-500 mt-0.5">
                        {formatDate(op.op_period_start)} {formatICSTime(op.op_period_start)} — {formatICSTime(op.op_period_end)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {profile?.role === 'admin' && (
                      <Link href={`/events/${id}/op/${op.id}/build`}
                        className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors">
                        Manage Org Chart
                      </Link>
                    )}
                    {(profile?.role === 'admin' || profile?.role === 'supervisor') && (
                      <Link href={`/events/${id}/op/${op.id}/review`}
                        className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors">
                        Review
                      </Link>
                    )}
                    {profile?.role === 'admin' && (
                      op.status === 'active' ? (
                        <button
                          onClick={() => setConfirming(`close-op-${op.id}`)}
                          className="text-xs bg-red-950/60 text-red-400 border border-red-900 px-3 py-1.5 rounded-lg font-medium hover:bg-red-900/60 transition-colors">
                          Demobilize
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirming(`reopen-op-${op.id}`)}
                          className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors">
                          Reopen
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="px-4 pb-3 flex gap-2 flex-wrap">
                  {myOpAssignment && (
                    <Link
                      href={`/events/${id}/op/${op.id}/log`}
                      className="bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-500 transition-colors"
                    >
                      Open My 214
                    </Link>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'supervisor') && (
                    <Link
                      href={`/api/events/${id}/op/${op.id}/export/all`}
                      className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-700 transition-colors"
                    >
                      Export Operational Period {op.period_number}
                    </Link>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    {opAssignments.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-zinc-600">No personnel assigned yet.</p>
                    ) : (
                      <div className="px-4 py-3">
                        {opTeams.filter((t: any) => !t.group_id).map((team: any) => {
                          const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                          return (
                            <div key={team.id} className="mb-3">
                              <p className="text-xs text-zinc-500 mb-1 font-mono">Team: {team.name}</p>
                              {teamMembers.map((a: any) => {
                                const p = profileMap[a.user_id]
                                return (
                                  <Link key={a.id}
                                    href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                    className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity">
                                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                                      {getInitials(p?.full_name ?? '?')}
                                    </div>
                                    <span className="text-xs text-zinc-300">{p?.full_name ?? 'Unknown'}</span>
                                    <span className="text-xs text-zinc-600">{a.ics_position.replace(/_/g, ' ')}</span>
                                  </Link>
                                )
                              })}
                            </div>
                          )
                        })}

                        {opGroups.filter((g: any) => !g.division_id).map((grp: any) => {
                          const grpTeams = opTeams.filter((t: any) => t.group_id === grp.id)
                          return (
                            <div key={grp.id} className="mb-3">
                              <p className="text-xs text-zinc-400 mb-1 font-mono">Group: {grp.name}</p>
                              {grpTeams.map((team: any) => {
                                const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                                return (
                                  <div key={team.id} className="ml-3 mb-2">
                                    <p className="text-xs text-zinc-500 mb-1">Team: {team.name}</p>
                                    {teamMembers.map((a: any) => {
                                      const p = profileMap[a.user_id]
                                      return (
                                        <Link key={a.id}
                                          href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                          className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity">
                                          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                                            {getInitials(p?.full_name ?? '?')}
                                          </div>
                                          <span className="text-xs text-zinc-300">{p?.full_name ?? 'Unknown'}</span>
                                          <span className="text-xs text-zinc-600">{a.ics_position.replace(/_/g, ' ')}</span>
                                        </Link>
                                      )
                                    })}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}

                        {opDivisions.map((div: any) => {
                          const divGroups = opGroups.filter((g: any) => g.division_id === div.id)
                          return (
                            <div key={div.id} className="mb-3">
                              <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">
                                {div.type === 'branch' ? 'Branch' : 'Division'}: {div.name}
                              </p>
                              {divGroups.map((grp: any) => {
                                const grpTeams = opTeams.filter((t: any) => t.group_id === grp.id)
                                return (
                                  <div key={grp.id} className="ml-3 mb-2">
                                    <p className="text-xs text-zinc-500 mb-1">Group: {grp.name}</p>
                                    {grpTeams.map((team: any) => {
                                      const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                                      return (
                                        <div key={team.id} className="ml-3 mb-2">
                                          <p className="text-xs text-zinc-600 mb-1">Team: {team.name}</p>
                                          {teamMembers.map((a: any) => {
                                            const p = profileMap[a.user_id]
                                            return (
                                              <Link key={a.id}
                                                href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                                className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity">
                                                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                                                  {getInitials(p?.full_name ?? '?')}
                                                </div>
                                                <span className="text-xs text-zinc-300">{p?.full_name ?? 'Unknown'}</span>
                                                <span className="text-xs text-zinc-600">{a.ics_position.replace(/_/g, ' ')}</span>
                                              </Link>
                                            )
                                          })}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/50">
                      <p className="text-xs text-zinc-600">{opAssignments.length} personnel assigned</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}