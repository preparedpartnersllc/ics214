'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInitials, formatICSTime } from '@/lib/utils'
import { getPositionLabel, ICS_POSITIONS } from '@/lib/ics-positions'
import {
  activityStatus, fmtAgo, STATUS_DOT_COLOR, STATUS_LABEL,
  fetchLastEntryMap, type LastEntryMap, ACTIVE_THRESHOLD_MIN,
  type ActivityStatus,
} from '@/lib/accountability'
import { derivePersonnelStatus, type PersonnelStatus } from '@/lib/personnel-lifecycle'
import Link from 'next/link'

// ── Section classification ────────────────────────────────────────
const CMD_POS = new Set([
  'incident_commander','deputy_incident_commander','safety_officer',
  'public_information_officer','liaison_officer','agency_representative',
])
const OPS_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Operations Section').map(p => p.value))
const PLN_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Planning Section').map(p => p.value))
const LOG_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Logistics Section').map(p => p.value))
const FIN_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Finance/Admin Section').map(p => p.value))

function sectionOf(pos: string): string {
  if (CMD_POS.has(pos)) return 'Command'
  if (OPS_POS.has(pos)) return 'Operations'
  if (PLN_POS.has(pos)) return 'Planning'
  if (LOG_POS.has(pos)) return 'Logistics'
  if (FIN_POS.has(pos)) return 'Finance'
  return 'Other'
}

const SECTION_CHIEF: Record<string, string> = {
  Command:    'incident_commander',
  Operations: 'operations_section_chief',
  Planning:   'planning_section_chief',
  Logistics:  'logistics_section_chief',
  Finance:    'finance_admin_section_chief',
}

// ── Tiny reusable components ─────────────────────────────────────

function StatCard({ label, value, color, sub }: {
  label: string; value: number | string; color: string; sub?: string
}) {
  return (
    <div className="bg-[#161D26] border border-[#232B36] rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <p className="text-[10px] font-mono text-[#4B5563] uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-[#374151] leading-none mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-widest mb-2 mt-1">
      {label}
    </p>
  )
}

function Divider() {
  return <div className="border-t border-[#1a2235] my-5" />
}

export default function DashboardPage() {
  const params  = useParams()
  const eventId = params.id as string
  const opId    = params.opId as string

  const [op, setOp]                     = useState<any>(null)
  const [event, setEvent]               = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Personnel universe
  const [profiles, setProfiles]         = useState<any[]>([])
  const [profileMap, setProfileMap]     = useState<Record<string, any>>({})

  // Active OP data
  const [assignments, setAssignments]   = useState<any[]>([])
  const [checkins, setCheckins]         = useState<any[]>([])
  const [demobRequests, setDemobRequests] = useState<any[]>([])
  const [lastEntryMap, setLastEntryMap] = useState<LastEntryMap>({})
  const [alerts, setAlerts]             = useState<any[]>([])
  const [meetings, setMeetings]         = useState<any[]>([])

  const [loading, setLoading]           = useState(true)
  const [tick, setTick]                 = useState(0)  // re-render ticker for live relative times

  useEffect(() => { load() }, [opId])
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    const [
      { data: opData }, { data: evData }, { data: pData },
      { data: aData }, { data: ciData }, { data: drData },
      { data: alertData }, { data: meetData },
      entryMap,
    ] = await Promise.all([
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('personnel_checkins').select('*').eq('operational_period_id', opId),
      supabase.from('demob_requests').select('*, demob_approvals(*)').eq('operational_period_id', opId),
      supabase.from('event_alerts').select('*').eq('event_id', eventId).eq('is_active', true),
      supabase.from('event_meetings')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_cancelled', false)
        .gte('start_time', new Date().toISOString())
        .order('start_time')
        .limit(3),
      fetchLastEntryMap(supabase, opId),
    ])

    setOp(opData)
    setEvent(evData)
    setProfiles(pData ?? [])
    setProfileMap((pData ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {}))
    setAssignments(aData ?? [])
    setCheckins(ciData ?? [])
    setDemobRequests(drData ?? [])
    setAlerts(alertData ?? [])
    setMeetings(meetData ?? [])
    setLastEntryMap(entryMap)
    setLoading(false)
  }

  // ── Derived ──────────────────────────────────────────────────────
  const checkinSet = useMemo(
    () => new Set(checkins.map((c: any) => c.user_id)),
    [checkins]
  )
  const assignedUserIds = useMemo(
    () => new Set(assignments.map((a: any) => a.user_id)),
    [assignments]
  )
  const pendingDemobSet = useMemo(
    () => new Set(demobRequests.filter((r: any) => r.status === 'pending').map((r: any) => r.user_id)),
    [demobRequests]
  )
  const demobilizedSet = useMemo(
    () => new Set(demobRequests.filter((r: any) => r.status === 'approved').map((r: any) => r.user_id)),
    [demobRequests]
  )

  // Per-person lifecycle status
  const lifecycleByUserId = useMemo(() => {
    const m: Record<string, PersonnelStatus> = {}
    profiles.forEach(p => {
      m[p.id] = derivePersonnelStatus(p.id, checkinSet, assignedUserIds, pendingDemobSet, demobilizedSet)
    })
    return m
  }, [profiles, checkinSet, assignedUserIds, pendingDemobSet, demobilizedSet])

  // Summary counts
  const counts = useMemo(() => {
    let notIn = 0, staging = 0, assigned = 0, pendingDemob = 0, demobilized = 0
    profiles.forEach(p => {
      const s = lifecycleByUserId[p.id]
      if (s === 'not_checked_in') notIn++
      else if (s === 'staging')    staging++
      else if (s === 'assigned')   assigned++
      else if (s === 'pending_demob') pendingDemob++
      else if (s === 'demobilized')   demobilized++
    })
    const pendingApprovals = demobRequests
      .filter((r: any) => r.status === 'pending')
      .reduce((sum: number, r: any) => {
        const done = (r.demob_approvals ?? []).filter((a: any) => a.approved_at).length
        const total = (r.demob_approvals ?? []).length
        return sum + (total - done)
      }, 0)
    return { notIn, staging, assigned, pendingDemob, demobilized, pendingApprovals }
  }, [profiles, lifecycleByUserId, demobRequests])

  // Accountability breakdown (assigned + staging people only)
  type AcctRow = { profile: any; status: ActivityStatus; last: string | undefined; assignment: any; lc: PersonnelStatus }
  const accountabilityRows = useMemo(() => {
    const active: AcctRow[] = [], warning: AcctRow[] = [], noLog: AcctRow[] = []
    profiles.forEach(p => {
      const lc = lifecycleByUserId[p.id]
      if (lc === 'not_checked_in' || lc === 'demobilized') return
      const st = activityStatus(p.id, lastEntryMap)
      const assignment = assignments.find((a: any) => a.user_id === p.id)
      const row: AcctRow = { profile: p, status: st, last: lastEntryMap[p.id], assignment, lc }
      if (st === 'active')          active.push(row)
      else if (st === 'warning')    warning.push(row)
      else                          noLog.push(row)
    })
    return { active, warning, noLog }
  }, [profiles, lifecycleByUserId, lastEntryMap, assignments])

  // Section staffing snapshot
  const sectionSnapshot = useMemo(() => {
    const sections = ['Command', 'Operations', 'Planning', 'Logistics', 'Finance']
    return sections.map(sec => {
      const secAssignments = assignments.filter(a => {
        const s = sectionOf(a.ics_position)
        return s === sec
      })
      const chiefPos = SECTION_CHIEF[sec]
      const chiefAssignment = secAssignments.find(a => a.ics_position === chiefPos)
      const chiefProfile = chiefAssignment ? profileMap[chiefAssignment.user_id] : null
      const pendingInSec = secAssignments.filter(a => pendingDemobSet.has(a.user_id))
      return {
        sec, filled: secAssignments.length,
        chiefName: chiefProfile?.full_name ?? null,
        chiefPos,
        pendingCount: pendingInSec.length,
      }
    })
  }, [assignments, profileMap, pendingDemobSet])

  // Pending demob requests with full detail
  const pendingRequests = useMemo(
    () => demobRequests.filter((r: any) => r.status === 'pending'),
    [demobRequests]
  )

  // Vacancies: assigned positions where person is pending demob (imminent vacancy)
  // + currently empty key command/section-chief slots
  const imminentVacancies = useMemo(() => {
    return assignments
      .filter(a => pendingDemobSet.has(a.user_id))
      .map(a => ({ assignment: a, profile: profileMap[a.user_id] }))
  }, [assignments, pendingDemobSet, profileMap])

  // My pending approval actions
  const myPendingApprovals = useMemo(() => {
    if (!currentUserId) return []
    const out: Array<{ approval: any; request: any }> = []
    demobRequests.forEach((req: any) => {
      if (req.status !== 'pending') return
      ;(req.demob_approvals ?? []).forEach((appr: any) => {
        if (appr.approver_user_id === currentUserId && !appr.approved_at) {
          out.push({ approval: appr, request: req })
        }
      })
    })
    return out
  }, [demobRequests, currentUserId])

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm font-mono">Loading…</p>
    </div>
  )

  const opLabel = `OP ${op?.period_number}`

  return (
    <div className="min-h-screen bg-[#0B0F14]">

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header className="sticky top-12 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        <div className="px-4 h-11 flex items-center gap-3 max-w-4xl mx-auto">
          <Link href={`/events/${eventId}`}
            className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex-shrink-0">
            ← Event
          </Link>
          <div className="w-px h-4 bg-[#232B36]" />
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            <span className="text-xs font-semibold text-[#E5E7EB] truncate">{event?.name}</span>
            <span className="text-[10px] text-[#4B5563] font-mono flex-shrink-0">{opLabel} · Dashboard</span>
          </div>
          {/* Quick nav */}
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            {[
              { label: 'Staff',    href: `/events/${eventId}/op/${opId}/staff`   },
              { label: 'Check-In', href: `/events/${eventId}/op/${opId}/checkin` },
              { label: 'Roster',   href: `/events/${eventId}/roster`             },
              { label: 'Meetings', href: `/events/${eventId}/meetings`           },
            ].map(({ label, href }) => (
              <Link key={label} href={href}
                className="text-[10px] text-[#4B5563] hover:text-[#E5E7EB] px-2 py-1 rounded hover:bg-[#161D26] transition-colors font-mono">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="px-4 py-5 max-w-4xl mx-auto pb-24 space-y-6">

        {/* ── ACTIVE ALERTS STRIP ──────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="flex items-center gap-2 bg-[#EF4444]/8 border border-[#EF4444]/25 rounded-xl px-4 py-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#EF4444] flex-shrink-0 animate-pulse" />
            <p className="text-xs font-semibold text-[#EF4444] flex-shrink-0">{alerts.length} active alert{alerts.length > 1 ? 's' : ''}</p>
            <p className="text-xs text-[#9CA3AF] truncate flex-1 hidden sm:block">{alerts[0]?.title}</p>
            <Link href={`/events/${eventId}`}
              className="text-[10px] text-[#EF4444] hover:text-red-300 font-mono flex-shrink-0">
              View →
            </Link>
          </div>
        )}

        {/* ── PART 2: SUMMARY CARDS ────────────────────────────── */}
        <div>
          <SectionHeader label="Personnel status" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <StatCard label="Not In"     value={counts.notIn}          color="#EF4444" />
            <StatCard label="Staging"    value={counts.staging}        color="#3B82F6" />
            <StatCard label="Assigned"   value={counts.assigned}       color="#22C55E" />
            <StatCard label="Pend Demob" value={counts.pendingDemob}   color="#F59E0B" />
            <StatCard label="Demobilized" value={counts.demobilized}   color="#6B7280" />
            <StatCard
              label="Pend Approvals"
              value={counts.pendingApprovals}
              color={counts.pendingApprovals > 0 ? '#F59E0B' : '#374151'}
              sub={myPendingApprovals.length > 0 ? `${myPendingApprovals.length} need your action` : undefined}
            />
          </div>
        </div>

        {/* ── PART 3: STAFFING SNAPSHOT ────────────────────────── */}
        <div>
          <Divider />
          <SectionHeader label="Section staffing" />
          <div className="bg-[#161D26] border border-[#232B36] rounded-xl overflow-hidden divide-y divide-[#1a2235]">
            {sectionSnapshot.map(({ sec, filled, chiefName, pendingCount }) => (
              <div key={sec} className="flex items-center gap-4 px-4 py-3">
                {/* Section label */}
                <p className="text-xs font-semibold text-[#9CA3AF] w-24 flex-shrink-0">{sec}</p>
                {/* Chief status */}
                <div className="flex-1 min-w-0">
                  {chiefName ? (
                    <p className="text-xs text-[#E5E7EB] truncate">{chiefName}</p>
                  ) : (
                    <p className="text-xs text-[#EF4444] font-medium">Chief vacant</p>
                  )}
                </div>
                {/* Filled count */}
                <p className="text-[10px] font-mono text-[#4B5563] flex-shrink-0">
                  {filled} assigned
                </p>
                {/* Pending demob warning */}
                {pendingCount > 0 && (
                  <span className="text-[9px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-px rounded font-mono flex-shrink-0">
                    {pendingCount} pending demob
                  </span>
                )}
                {/* Chief indicator dot */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: chiefName ? '#22C55E' : '#EF4444' }}
                  title={chiefName ? 'Chief assigned' : 'No chief'}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Link href={`/events/${eventId}/op/${opId}/staff`}
              className="text-[10px] text-[#4B5563] hover:text-[#FF5A1F] font-mono transition-colors">
              Open staffing board →
            </Link>
          </div>
        </div>

        {/* ── PART 4 + PART 6: DEMOB WATCH + VACANCY WATCH ─────── */}
        {(pendingRequests.length > 0 || imminentVacancies.length > 0) && (
          <div>
            <Divider />
            <SectionHeader label={`Demob watch · ${pendingRequests.length} pending`} />
            <div className="space-y-2">
              {pendingRequests.map((req: any) => {
                const person  = profileMap[req.user_id]
                const asgn    = assignments.find((a: any) => a.id === req.assignment_id)
                const approvs = req.demob_approvals ?? []
                const doneN   = approvs.filter((a: any) => a.approved_at).length
                const totalN  = approvs.length
                const blockers = approvs
                  .filter((a: any) => !a.approved_at)
                  .map((a: any) => getPositionLabel(a.approver_position))
                const myApproval = currentUserId
                  ? approvs.find((a: any) => a.approver_user_id === currentUserId && !a.approved_at)
                  : null

                return (
                  <div key={req.id}
                    className="bg-[#161D26] border border-[#F59E0B]/25 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#F59E0B]/8 border-b border-[#F59E0B]/15">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-[#1a2235] border border-[#F59E0B]/20 flex items-center justify-center text-[10px] font-mono text-[#9CA3AF] flex-shrink-0">
                          {getInitials(person?.full_name ?? '?')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#E5E7EB] truncate">{person?.full_name ?? 'Unknown'}</p>
                          <p className="text-[10px] text-[#6B7280]">{getPositionLabel(asgn?.ics_position ?? '')} · {sectionOf(asgn?.ics_position ?? '')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {totalN > 0 && (
                          <span className="text-[10px] font-mono text-[#F59E0B]">{doneN}/{totalN} approved</span>
                        )}
                        {totalN === 0 && (
                          <span className="text-[10px] font-mono text-[#6B7280]">awaiting approval</span>
                        )}
                      </div>
                    </div>
                    {/* Approval rows */}
                    {approvs.length > 0 && (
                      <div className="px-4 py-2 space-y-1">
                        {approvs.map((appr: any) => (
                          <div key={appr.id} className="flex items-center gap-2 text-[10px]">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${appr.approved_at ? 'bg-[#22C55E]' : 'bg-[#374151]'}`} />
                            <span className={appr.approved_at ? 'text-[#22C55E]' : 'text-[#6B7280]'}>
                              {getPositionLabel(appr.approver_position)}
                            </span>
                            {appr.approved_at && (
                              <span className="text-[#374151] ml-auto">{fmtAgo(appr.approved_at)}</span>
                            )}
                            {!appr.approved_at && (
                              <span className="text-[#374151] ml-auto font-mono">pending</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* My approve action */}
                    {myApproval && (
                      <div className="px-4 pb-3">
                        <p className="text-[10px] text-[#F59E0B] mb-1.5">Your approval is required.</p>
                        <Link
                          href={`/events/${eventId}/op/${opId}/staff`}
                          className="inline-block text-xs font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Go to Staff Board to Approve →
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Imminent vacancies — positions about to open */}
            {imminentVacancies.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-widest mb-2">
                  Imminent vacancies ({imminentVacancies.length})
                </p>
                <div className="bg-[#161D26] border border-[#232B36] rounded-xl overflow-hidden divide-y divide-[#1a2235]">
                  {imminentVacancies.map(({ assignment: a, profile: p }) => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] flex-shrink-0" />
                      <p className="text-xs text-[#E5E7EB] flex-1 truncate">
                        {getPositionLabel(a.ics_position)}
                        <span className="text-[#4B5563] ml-1">· {sectionOf(a.ics_position)}</span>
                      </p>
                      <p className="text-[10px] text-[#6B7280] truncate">{p?.full_name ?? '—'}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-end">
                  <Link href={`/events/${eventId}/op/${opId}/staff`}
                    className="text-[10px] text-[#4B5563] hover:text-[#FF5A1F] font-mono transition-colors">
                    Prepare replacements on Staff Board →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PART 5: ACCOUNTABILITY WATCH ─────────────────────── */}
        <div>
          <Divider />
          <div className="flex items-baseline justify-between mb-2">
            <SectionHeader label={`Accountability · ${ACTIVE_THRESHOLD_MIN}m threshold`} />
            <span className="text-[10px] font-mono text-[#374151] mb-2">
              {accountabilityRows.active.length} active · {accountabilityRows.warning.length} warning · {accountabilityRows.noLog.length} no log
            </span>
          </div>

          {/* Warning + no-log rows — people needing attention */}
          {(accountabilityRows.warning.length > 0 || accountabilityRows.noLog.length > 0) ? (
            <div className="bg-[#161D26] border border-[#232B36] rounded-xl overflow-hidden divide-y divide-[#1a2235]">
              {[...accountabilityRows.warning, ...accountabilityRows.noLog].map(({ profile: p, status, last, assignment }) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT_COLOR[status] }} />
                  <div className="w-6 h-6 rounded-full bg-[#1a2235] border border-[#232B36] flex items-center justify-center text-[10px] font-mono text-[#9CA3AF] flex-shrink-0">
                    {getInitials(p.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#E5E7EB] truncate">{p.full_name}</p>
                    <p className="text-[10px] text-[#4B5563] truncate leading-none mt-px">
                      {assignment ? getPositionLabel(assignment.ics_position) : 'Staging'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] font-semibold leading-none" style={{ color: STATUS_DOT_COLOR[status] }}>
                      {STATUS_LABEL[status]}
                    </p>
                    {last
                      ? <p className="text-[10px] text-[#374151] leading-none mt-0.5">{fmtAgo(last)}</p>
                      : <p className="text-[10px] text-[#374151] leading-none mt-0.5">no entries</p>
                    }
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#161D26] border border-[#232B36] rounded-xl px-4 py-4 text-center">
              <p className="text-xs text-[#22C55E] font-medium">All checked-in personnel active</p>
              <p className="text-[10px] text-[#374151] mt-0.5">Everyone has logged within {ACTIVE_THRESHOLD_MIN} minutes</p>
            </div>
          )}

          {/* Active — collapsed summary */}
          {accountabilityRows.active.length > 0 && (
            <p className="text-[10px] text-[#374151] font-mono mt-2 px-1">
              {accountabilityRows.active.length} personnel active
              {accountabilityRows.active[0] && ` · last: ${fmtAgo(accountabilityRows.active.sort((a, b) => new Date(b.last ?? 0).getTime() - new Date(a.last ?? 0).getTime())[0].last!)}`}
            </p>
          )}

          <div className="mt-2 flex justify-end">
            <Link href={`/events/${eventId}/roster`}
              className="text-[10px] text-[#4B5563] hover:text-[#FF5A1F] font-mono transition-colors">
              Full roster view →
            </Link>
          </div>
        </div>

        {/* ── NOT CHECKED IN LIST ───────────────────────────────── */}
        {counts.notIn > 0 && (
          <div>
            <Divider />
            <div className="flex items-baseline justify-between mb-2">
              <SectionHeader label={`Not checked in · ${counts.notIn}`} />
              <Link href={`/events/${eventId}/op/${opId}/checkin`}
                className="text-[10px] text-[#3B82F6] hover:text-blue-300 font-mono mb-2 transition-colors">
                Check-In page →
              </Link>
            </div>
            <div className="bg-[#161D26] border border-[#232B36] rounded-xl overflow-hidden divide-y divide-[#1a2235]">
              {profiles.filter(p => lifecycleByUserId[p.id] === 'not_checked_in').map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#374151] flex-shrink-0" />
                  <div className="w-6 h-6 rounded-full bg-[#121821] border border-[#1a2235] flex items-center justify-center text-[10px] font-mono text-[#4B5563] flex-shrink-0">
                    {getInitials(p.full_name)}
                  </div>
                  <p className="text-xs text-[#6B7280] flex-1 truncate">{p.full_name}</p>
                  <p className="text-[10px] text-[#374151] truncate flex-shrink-0">{p.default_agency ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PART 7: QUICK ACTIONS ────────────────────────────── */}
        <div>
          <Divider />
          <SectionHeader label="Quick actions" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: 'Staff Board',   sub: 'Assign & manage slots',   href: `/events/${eventId}/op/${opId}/staff`,   color: '#FF5A1F' },
              { label: 'Check-In',      sub: 'Log arrivals',             href: `/events/${eventId}/op/${opId}/checkin`, color: '#3B82F6' },
              { label: 'Roster',        sub: 'Full personnel list',       href: `/events/${eventId}/roster`,            color: '#22C55E' },
              { label: 'Meetings',      sub: 'Schedule & briefings',      href: `/events/${eventId}/meetings`,          color: '#8B5CF6' },
              { label: 'ICS 214 Log',   sub: 'Log your activity',         href: `/events/${eventId}/op/${opId}/log`,    color: '#F59E0B' },
              { label: 'Demob Config',  sub: 'Set required approvers',    href: `/events/${eventId}/demob-config`,      color: '#6B7280' },
            ].map(({ label, sub, href, color }) => (
              <Link key={label} href={href}
                className="bg-[#161D26] border border-[#232B36] hover:border-[#3a4555] rounded-xl px-4 py-3 transition-colors group">
                <div className="w-1.5 h-1.5 rounded-full mb-2 flex-shrink-0" style={{ backgroundColor: color }} />
                <p className="text-xs font-semibold text-[#E5E7EB] group-hover:text-white">{label}</p>
                <p className="text-[10px] text-[#374151] mt-0.5">{sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* ── UPCOMING MEETINGS STRIP ──────────────────────────── */}
        {meetings.length > 0 && (
          <div>
            <Divider />
            <SectionHeader label="Upcoming meetings" />
            <div className="bg-[#161D26] border border-[#232B36] rounded-xl overflow-hidden divide-y divide-[#1a2235]">
              {meetings.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#E5E7EB] truncate">{m.title}</p>
                    <p className="text-[10px] text-[#4B5563] leading-none mt-px">
                      {formatICSTime(m.start_time)}
                    </p>
                  </div>
                  <Link href={`/events/${eventId}/meetings`}
                    className="text-[10px] text-[#4B5563] hover:text-[#E5E7EB] font-mono flex-shrink-0 transition-colors">
                    View →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
