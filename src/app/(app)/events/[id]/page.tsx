'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSTime, formatDate, formatICSDateTime, getInitials } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import Link from 'next/link'

// Resolve the direct supervisor position in the ICS hierarchy
function getSupervisorPosition(icsPosition: string): string | null {
  if (icsPosition === 'incident_commander') return null
  if (['deputy_incident_commander', 'safety_officer', 'public_information_officer',
       'liaison_officer', 'agency_representative'].includes(icsPosition))
    return 'incident_commander'
  if (['planning_section_chief', 'operations_section_chief',
       'logistics_section_chief', 'finance_admin_section_chief'].includes(icsPosition))
    return 'incident_commander'
  if (icsPosition.startsWith('planning_')) return 'planning_section_chief'
  if (['operations_section_deputy', 'staging_area_manager', 'branch_director',
       'branch_deputy_director', 'air_ops_branch_director',
       'division_group_supervisor', 'team_member'].includes(icsPosition))
    return 'operations_section_chief'
  if (icsPosition.startsWith('logistics_')) return 'logistics_section_chief'
  if (['finance_admin_section_deputy', 'time_unit_leader', 'procurement_unit_leader',
       'comp_claims_unit_leader', 'cost_unit_leader'].includes(icsPosition))
    return 'finance_admin_section_chief'
  return 'incident_commander'
}

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
  const [recentEntries, setRecentEntries] = useState<any[]>([])
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

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

    // Fetch recent activity for current user in active OP
    const activeOpItem = (opData ?? []).find((o: any) => o.status === 'active')
    if (activeOpItem) {
      const myA = (aData ?? []).find(
        (a: any) => a.operational_period_id === activeOpItem.id && a.user_id === user.id
      )
      if (myA) {
        const { data: entries } = await supabase
          .from('activity_entries')
          .select('*')
          .eq('assignment_id', myA.id)
          .order('entry_time', { ascending: false })
          .limit(4)
        setRecentEntries(entries ?? [])
      }
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

  // ── Derived state ──────────────────────────────────────────
  const activeOp = ops.find(o => o.status === 'active') ?? null
  const activeOpAssignments = assignments.filter(a => a.operational_period_id === activeOp?.id)
  const myAssignment = currentUserId
    ? activeOpAssignments.find(a => a.user_id === currentUserId) ?? null
    : null
  const myTeam = myAssignment ? teams.find(t => t.id === myAssignment.team_id) ?? null : null
  const teammates = myAssignment
    ? activeOpAssignments.filter(a => a.team_id === myAssignment.team_id && a.user_id !== currentUserId)
    : []
  const supervisorPos = myAssignment ? getSupervisorPosition(myAssignment.ics_position) : null
  const supervisorAssignment = supervisorPos
    ? activeOpAssignments.find(a => a.ics_position === supervisorPos) ?? null
    : null
  const supervisorProfile = supervisorAssignment
    ? profileMap[supervisorAssignment.user_id] ?? null
    : null

  const isAdmin = profile?.role === 'admin'
  const canManage = isAdmin || profile?.role === 'supervisor'

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── STICKY HEADER ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/70">
        <div className="px-4 py-2.5 sm:py-3 max-w-2xl mx-auto flex items-center justify-between gap-4">
          <Link
            href="/events"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Events
          </Link>
          <div className="min-w-0 text-right">
            <p className="text-sm font-semibold text-zinc-100 truncate">{event.name}</p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5 flex-wrap">
              {event.incident_number && (
                <span className="text-xs font-mono text-zinc-600">#{event.incident_number}</span>
              )}
              {activeOp ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 ring-1 ring-inset ring-green-500/20">
                  OP {activeOp.period_number} Active
                </span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 ring-1 ring-inset ring-zinc-700/30 capitalize">
                  {event.status}
                </span>
              )}
              {profile?.role && profile.role !== 'member' && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/20 capitalize">
                  {profile.role}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── CONFIRMATION MODAL ────────────────────────────────── */}
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

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <main className="flex-1 px-4 pt-4 sm:pt-6 pb-10 max-w-2xl mx-auto w-full">

        {/* 1 · ACTIVE OP STRIP ──────────────────────────────── */}
        {activeOp ? (
          <div className="mb-6 bg-orange-500/5 border border-orange-500/15 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Active Period</p>
              <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                Operational Period {activeOp.period_number}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-zinc-600 mb-0.5">Window</p>
              <p className="text-xs font-mono text-zinc-400">
                {formatICSTime(activeOp.op_period_start)} — {formatICSTime(activeOp.op_period_end)}
              </p>
            </div>
          </div>
        ) : ops.length > 0 ? (
          <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
            <p className="text-sm text-zinc-500">No active operational period.</p>
          </div>
        ) : null}

        {/* 2 · MY ASSIGNMENT ────────────────────────────────── */}
        {myAssignment ? (
          <section className="mb-8">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">My Assignment</p>

            <p className="text-2xl font-bold text-zinc-100 leading-tight tracking-tight">
              {getPositionLabel(myAssignment.ics_position)}
            </p>
            {myTeam && !myTeam.name.startsWith('__') && (
              <p className="text-sm text-zinc-500 mt-1">Team: {myTeam.name}</p>
            )}

            <div className="mt-5 space-y-3.5">
              {supervisorProfile && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 w-24 flex-shrink-0">Reporting to</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                      {getInitials(supervisorProfile.full_name ?? '')}
                    </div>
                    <span className="text-sm text-zinc-300 truncate">{supervisorProfile.full_name}</span>
                    <span className="text-xs text-zinc-600 flex-shrink-0 hidden sm:inline">
                      · {getPositionLabel(supervisorAssignment!.ics_position)}
                    </span>
                  </div>
                </div>
              )}

              {teammates.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xs text-zinc-600 w-24 flex-shrink-0 pt-1">Team</span>
                  <div className="flex flex-wrap gap-1.5">
                    {teammates.slice(0, 5).map((a: any) => {
                      const p = profileMap[a.user_id]
                      return (
                        <div
                          key={a.id}
                          title={`${p?.full_name ?? 'Unknown'} · ${getPositionLabel(a.ics_position)}`}
                          className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-full pl-1 pr-2.5 py-0.5"
                        >
                          <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                            {getInitials(p?.full_name ?? '?')}
                          </div>
                          <span className="text-xs text-zinc-400 max-w-[80px] truncate">
                            {p?.full_name ?? 'Unknown'}
                          </span>
                        </div>
                      )
                    })}
                    {teammates.length > 5 && (
                      <div className="flex items-center px-2 text-xs text-zinc-600">
                        +{teammates.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : activeOp ? (
          <div className="mb-8 border border-zinc-800 border-dashed rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-zinc-500">You are not assigned to the active operational period.</p>
            <p className="text-xs text-zinc-600 mt-1">Contact your supervisor to be added.</p>
          </div>
        ) : null}

        {/* 3 · PRIMARY CTA ──────────────────────────────────── */}
        {myAssignment && activeOp && (
          <div className="mb-8">
            <Link
              href={`/events/${id}/op/${activeOp.id}/log`}
              className="w-full flex items-center justify-center gap-2.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 active:scale-[0.98] text-white px-6 py-4 rounded-xl text-base font-bold transition-all shadow-lg shadow-orange-900/20 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Log ICS 214 Activity
            </Link>
          </div>
        )}

        {/* 4 · RECENT ACTIVITY ──────────────────────────────── */}
        {recentEntries.length > 0 && activeOp && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Recent Activity</p>
              <Link
                href={`/events/${id}/op/${activeOp.id}/log`}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="relative">
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-zinc-800/60" />
              <div className="space-y-0">
                {recentEntries.map(entry => (
                  <div key={entry.id} className="flex gap-4 pb-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 ring-1 ring-zinc-600 flex-shrink-0 mt-1 relative z-10" />
                    <div className="flex-1 min-w-0">
                      <time className="text-xs font-mono text-orange-400/70">
                        {formatICSDateTime(entry.entry_time)}
                      </time>
                      <p className="text-sm text-zinc-300 leading-relaxed mt-0.5 line-clamp-2">
                        {entry.narrative}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── DIVIDER ──────────────────────────────────────────── */}
        {canManage && <div className="border-t border-zinc-800/60 mb-8" />}

        {/* 5 · MANAGEMENT SECTION (admin / supervisor) ──────── */}
        {canManage && (
          <section>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide flex-1">
                Operational Periods
              </p>
              {isAdmin && (
                <>
                  <Link
                    href={`/events/${id}/op/new`}
                    className="inline-flex items-center gap-1 text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-all"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add Period
                  </Link>
                  <Link
                    href={`/api/events/${id}/export`}
                    className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-all"
                  >
                    Export All
                  </Link>
                  {event.status === 'active' ? (
                    <button
                      onClick={() => setConfirming('close-event')}
                      className="text-xs bg-red-950/40 text-red-400 border border-red-900/60 px-2.5 py-1.5 rounded-lg font-medium hover:bg-red-950/70 transition-all"
                    >
                      Close Event
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirming('reopen-event')}
                      className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-all"
                    >
                      Reopen Event
                    </button>
                  )}
                </>
              )}
            </div>

            {ops.length === 0 ? (
              <div className="border border-zinc-800 border-dashed rounded-xl p-8 text-center">
                <p className="text-zinc-600 text-sm">No operational periods yet.</p>
                {isAdmin && (
                  <Link href={`/events/${id}/op/new`}
                    className="inline-block mt-3 text-orange-500 text-sm hover:underline">
                    Create first operational period →
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {ops.map((op: any) => {
                  const isExpanded = expandedOps.has(op.id)
                  const opDivisions = divisions.filter((d: any) => d.operational_period_id === op.id)
                  const opAssignments = assignments.filter((a: any) => a.operational_period_id === op.id)
                  const opTeams = teams.filter((t: any) => t.operational_period_id === op.id)
                  const opGroups = groups.filter((g: any) => g.operational_period_id === op.id)
                  const myOpAssignment = opAssignments.find((a: any) => a.user_id === currentUserId)

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
                              <p className="text-sm font-semibold text-zinc-200">
                                Operational Period {op.period_number}
                              </p>
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
                          {isAdmin && (
                            <Link
                              href={`/events/${id}/op/${op.id}/build`}
                              className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                            >
                              Manage Org Chart
                            </Link>
                          )}
                          {canManage && (
                            <Link
                              href={`/events/${id}/op/${op.id}/review`}
                              className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                            >
                              Review
                            </Link>
                          )}
                          {isAdmin && (
                            op.status === 'active' ? (
                              <button
                                onClick={() => setConfirming(`close-op-${op.id}`)}
                                className="text-xs bg-red-950/60 text-red-400 border border-red-900 px-2.5 py-1.5 rounded-lg font-medium hover:bg-red-900/60 transition-colors"
                              >
                                Demobilize
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirming(`reopen-op-${op.id}`)}
                                className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                              >
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
                        {canManage && (
                          <Link
                            href={`/api/events/${id}/op/${op.id}/export/all`}
                            className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-700 transition-colors"
                          >
                            Export OP {op.period_number}
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
          </section>
        )}

        {/* 5b · NON-MANAGER: read-only periods list ─────────── */}
        {!canManage && ops.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">All Periods</p>
            <div className="space-y-2">
              {ops.map((op: any) => {
                const myOpA = assignments.find(
                  (a: any) => a.operational_period_id === op.id && a.user_id === currentUserId
                )
                return (
                  <div key={op.id}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-300">Operational Period {op.period_number}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
                          op.status === 'active'
                            ? 'bg-green-500/10 text-green-400 ring-green-500/20'
                            : 'bg-zinc-500/10 text-zinc-500 ring-zinc-700/30'
                        }`}>
                          {op.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-600 mt-0.5">
                        {formatICSTime(op.op_period_start)} — {formatICSTime(op.op_period_end)}
                      </p>
                    </div>
                    {myOpA && (
                      <Link
                        href={`/events/${id}/op/${op.id}/log`}
                        className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-lg font-medium hover:bg-zinc-700 transition-colors"
                      >
                        My 214
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}
