'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSTime, formatDate, getInitials } from '@/lib/utils'
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
  const [myAssignment, setMyAssignment] = useState<any>(null)
  const [myOp, setMyOp] = useState<any>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

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

    const myA = (aData ?? []).find((a: any) => a.user_id === user.id)
    setMyAssignment(myA ?? null)
    if (myA) {
      setMyOp((opData ?? []).find((op: any) => op.id === myA.operational_period_id) ?? null)
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

      {/* Confirm dialog overlay */}
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

      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
            event.status === 'active'
              ? 'bg-green-900/50 text-green-400 border-green-800'
              : event.status === 'closed'
              ? 'bg-red-900/50 text-red-400 border-red-800'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}>
            {event.status}
          </span>
          {event.incident_number && (
            <span className="text-xs font-mono text-zinc-500">#{event.incident_number}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">{event.name}</h1>
        {event.location && <p className="text-sm text-zinc-500 mt-0.5">{event.location}</p>}
        {event.summary && (
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed border-l-2 border-zinc-700 pl-3">
            {event.summary}
          </p>
        )}
      </div>

      {/* My 214 CTA */}
      {myAssignment && myOp && (
        <div className="mb-6 bg-orange-950/30 border border-orange-900/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-300">Your Activity Log</p>
            <p className="text-xs text-orange-600/80 mt-0.5">
              OP {myOp.period_number} — {myAssignment.ics_position.replace(/_/g, ' ')}
            </p>
          </div>
          <Link href={`/events/${id}/op/${myOp.id}/log`}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors">
            Open My 214
          </Link>
        </div>
      )}

      {/* Admin controls */}
      {profile?.role === 'admin' && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <Link href={`/events/${id}/op/new`}
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors">
            + Operational Period
          </Link>
          <Link href={`/api/events/${id}/export`}
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors">
            Export All
          </Link>
          {event.status === 'active' ? (
            <button
              onClick={() => setConfirming('close-event')}
              className="bg-red-950/50 text-red-400 border border-red-900 px-3 py-2 rounded-lg text-sm hover:bg-red-900/50 transition-colors">
              Close Event
            </button>
          ) : (
            <button
              onClick={() => setConfirming('reopen-event')}
              className="bg-zinc-800 text-zinc-400 border border-zinc-700 px-3 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors">
              Reopen Event
            </button>
          )}
        </div>
      )}

      {/* Operational Periods */}
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

            return (
              <div key={op.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* OP header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleOp(op.id)}
                      className="w-6 h-6 rounded flex items-center justify-center bg-zinc-800 text-zinc-400 hover:bg-zinc-700 flex-shrink-0 text-sm font-mono transition-colors"
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-200">
                          OP {op.period_number}
                        </p>
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          op.status === 'active'
                            ? 'bg-green-900/40 text-green-500'
                            : 'bg-zinc-800 text-zinc-500'
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
                        className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                        Manage
                      </Link>
                    )}
                    {(profile?.role === 'admin' || profile?.role === 'supervisor') && (
                      <Link href={`/events/${id}/op/${op.id}/review`}
                        className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                        Review
                      </Link>
                    )}
                    {profile?.role === 'admin' && (
                      op.status === 'active' ? (
                        <button
                          onClick={() => setConfirming(`close-op-${op.id}`)}
                          className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                          Demobilize
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirming(`reopen-op-${op.id}`)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                          Reopen
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Expandable org chart */}
                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    {opAssignments.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-zinc-600">No personnel assigned yet.</p>
                    ) : (
                      <div className="px-4 py-3">
                        {/* Show unorganized teams first */}
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

                        {/* Groups without divisions */}
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

                        {/* Divisions/Branches with groups */}
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
                      <p className="text-xs text-zinc-600">
                        {opAssignments.length} personnel assigned
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6">
        <Link href="/events" className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Events
        </Link>
      </div>
    </div>
  )
}