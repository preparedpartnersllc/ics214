'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSTime, formatDate, formatICSDateTime, getInitials } from '@/lib/utils'
import { getPositionLabel, OPERATIONS_POSITIONS, PLANNING_POSITIONS, LOGISTICS_POSITIONS, FINANCE_POSITIONS } from '@/lib/ics-positions'
import Link from 'next/link'
import type { EventMeeting } from '@/types'
import { activityStatus, STATUS_DOT_COLOR, fetchLastEntryMap, type LastEntryMap } from '@/lib/accountability'
import { badgeColorForPosition } from '@/lib/section-colors'
import { isAdminRole } from '@/lib/roles'

function buildCountdown(startIso: string, endIso: string): { label: string; color: string } {
  const now   = Date.now()
  const start = new Date(startIso).getTime()
  const end   = new Date(endIso).getTime()
  if (now >= end)   return { label: 'Ended',       color: 'text-[#6B7280]' }
  if (now >= start) return { label: 'In progress', color: 'text-[#22C55E]' }
  const diff = start - now
  const mins = Math.floor(diff / 60_000)
  const isSoon = diff <= 15 * 60_000
  let label: string
  if (mins === 0)   label = 'Starting now'
  else if (mins < 60) label = `Starts in ${mins}m`
  else {
    const hrs = Math.floor(mins / 60)
    const rem = mins % 60
    label = rem === 0 ? `Starts in ${hrs}h` : `Starts in ${hrs}h ${rem}m`
  }
  return { label, color: isSoon ? 'text-[#F59E0B]' : 'text-[#6B7280]' }
}

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

// -- Personnel section definitions (module-level) -----------------------------
const PERSONNEL_SECTIONS = [
  { label: 'Command',    color: '#9CA3AF', positions: new Set(['incident_commander','deputy_incident_commander','safety_officer','public_information_officer','liaison_officer']) },
  { label: 'Operations', color: '#EF4444', positions: new Set(OPERATIONS_POSITIONS.map((p: any) => p.value)) },
  { label: 'Planning',   color: '#EAB308', positions: new Set(PLANNING_POSITIONS.map((p: any) => p.value)) },
  { label: 'Logistics',  color: '#3B82F6', positions: new Set(LOGISTICS_POSITIONS.map((p: any) => p.value)) },
  { label: 'Finance',    color: '#22C55E', positions: new Set(FINANCE_POSITIONS.map((p: any) => p.value)) },
  { label: 'Agency',     color: '#6B7280', positions: new Set(['agency_representative']) },
]

function getMySection(icsPosition: string): string {
  for (const s of PERSONNEL_SECTIONS) {
    if (s.positions.has(icsPosition)) return s.label
  }
  return 'Command'
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
  const [lastEntryMap, setLastEntryMap]     = useState<LastEntryMap>({})
  const [demobRequests, setDemobRequests]   = useState<any[]>([])
  const [demobApprovals, setDemobApprovals] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Meetings (upcoming meetings this user is invited to, or all if admin)
  const [meetings, setMeetings] = useState<EventMeeting[]>([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  // Countdown ticker (re-renders every 30 s)
  const [tick, setTick] = useState(0)
  // Invite toast — shown when user has unread meeting notifications
  const [inviteToast, setInviteToast] = useState<{ title: string; body: string | null; meeting_id: string | null } | null>(null)

  // Personnel section collapse + person detail overlay
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [selectedPerson, setSelectedPerson] = useState<{ assignment: any; prof: any } | null>(null)

  // Alert form state
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [alertTitle, setAlertTitle] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const [alertSeverity, setAlertSeverity] = useState('warning')
  const [alertSubmitting, setAlertSubmitting] = useState(false)
  const [alertError, setAlertError] = useState<string | null>(null)
  const [alertExpanded, setAlertExpanded] = useState(false)

  useEffect(() => { load() }, [id])
  useEffect(() => { setAlertExpanded(false) }, [alerts])
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30_000)
    return () => clearInterval(t)
  }, [])

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

    const [{ data: divData }, { data: grpData }, { data: teamData }, { data: aData }, { data: alertData }] =
      await Promise.all([
        supabase.from('divisions').select('*').in('operational_period_id', opIds),
        supabase.from('groups').select('*').in('operational_period_id', opIds),
        supabase.from('teams').select('*').in('operational_period_id', opIds),
        supabase.from('assignments').select('*').in('operational_period_id', opIds),
        supabase.from('event_alerts').select('*').eq('event_id', id).eq('is_active', true).order('created_at', { ascending: false }),
      ])

    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])
    setAssignments(aData ?? [])
    setAlerts(alertData ?? [])

    // Set default expanded sections — always Command + user's own section
    const activeOpForSections = (opData ?? []).find((o: any) => o.status === 'active')
    if (activeOpForSections) {
      const myA = (aData ?? []).find((a: any) => a.user_id === user.id && a.operational_period_id === activeOpForSections.id)
      if (myA) {
        const mySection = getMySection(myA.ics_position)
        setExpandedSections(new Set([mySection]))
      }
    }

    // Include alert creator IDs so their names appear in profileMap
    const assignmentUserIds = (aData ?? []).map((a: any) => a.user_id)
    const alertCreatorIds = (alertData ?? []).map((a: any) => a.created_by).filter(Boolean)
    const userIds = [...new Set([...assignmentUserIds, ...alertCreatorIds])]
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds)
      const map = (profs ?? []).reduce((acc: any, prof: any) => {
        acc[prof.id] = prof; return acc
      }, {})
      setProfileMap(map)
    }

    // Load meetings this user is invited to (or all if admin)
    await loadMeetings(user.id, isAdminRole(p?.role))

    // Load unread notification count + first unread for invite toast
    const { data: unreadNotifs } = await supabase
      .from('in_app_notifications')
      .select('title, body, meeting_id')
      .eq('user_id', user.id)
      .eq('event_id', id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
    setUnreadNotifCount((unreadNotifs ?? []).length)
    if (unreadNotifs && unreadNotifs.length > 0) {
      setInviteToast(unreadNotifs[0] as any)
    }

    // Fetch activity entries for active OP — powers both the personal log preview
    // and the per-person status indicators in the personnel summary.
    // Queries by user_id (not assignment_id) so staging users are included.
    const activeOpItem = (opData ?? []).find((o: any) => o.status === 'active')
    if (activeOpItem) {
      const [entryMap, myEntriesResult] = await Promise.all([
        fetchLastEntryMap(supabase, activeOpItem.id),
        supabase
          .from('activity_entries')
          .select('*')
          .eq('operational_period_id', activeOpItem.id)
          .eq('user_id', user.id)
          .order('entry_time', { ascending: false })
          .limit(4),
      ])
      setLastEntryMap(entryMap)
      setRecentEntries(myEntriesResult.data ?? [])

      // Load demob requests and approvals for active OP
      const { data: drData } = await supabase
        .from('demob_requests')
        .select('*, demob_approvals(*)')
        .eq('operational_period_id', activeOpItem.id)
        .order('requested_at', { ascending: false })
      const allDemobRequests = drData ?? []
      setDemobRequests(allDemobRequests)
      setDemobApprovals(allDemobRequests.flatMap((r: any) => r.demob_approvals ?? []))
    }
  }

  async function loadMeetings(userId: string, isAdmin: boolean) {
    const supabase = createClient()
    const now = new Date().toISOString()
    if (isAdmin) {
      const { data } = await supabase
        .from('event_meetings')
        .select('*')
        .eq('event_id', id)
        .eq('is_cancelled', false)
        .order('start_time')
      setMeetings((data ?? []) as EventMeeting[])
    } else {
      const { data: invites } = await supabase
        .from('meeting_invitees')
        .select('meeting_id')
        .eq('user_id', userId)
      const ids = (invites ?? []).map((i: any) => i.meeting_id)
      if (ids.length > 0) {
        const { data } = await supabase
          .from('event_meetings')
          .select('*')
          .eq('event_id', id)
          .eq('is_cancelled', false)
          .in('id', ids)
          .gte('start_time', now)
          .order('start_time')
        setMeetings((data ?? []) as EventMeeting[])
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

  function toggleSection(label: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  async function closeEvent() {
    const supabase = createClient()
    // Close all active operational periods first
    const activeOpIds = ops.filter(o => o.status === 'active').map(o => o.id)
    if (activeOpIds.length > 0) {
      await supabase.from('operational_periods').update({ status: 'closed' }).in('id', activeOpIds)
      setOps(prev => prev.map(op => ({ ...op, status: 'closed' })))
    }
    await supabase.from('events').update({ status: 'closed' }).eq('id', id)
    setEvent((prev: any) => ({ ...prev, status: 'closed' }))
    setConfirming(null)
    router.push('/dashboard')
  }

  async function deleteEvent() {
    setDeleteError(null)
    const supabase = createClient()
    // DB has CASCADE deletes on all child tables — one delete is enough
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) {
      setDeleteError(error.message)
      setConfirming(null)
      return
    }
    router.push('/events')
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

  async function approveDemob(approvalId: string, demobRequestId: string) {
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase.from('demob_approvals')
      .update({ approved_at: now, approver_user_id: currentUserId })
      .eq('id', approvalId)

    // Re-fetch this request's approvals to check if all done
    const { data: allApprovals } = await supabase
      .from('demob_approvals')
      .select('*')
      .eq('demob_request_id', demobRequestId)

    const allDone = (allApprovals ?? []).every((a: any) => a.approved_at)
    if (allDone) {
      const req = demobRequests.find((r: any) => r.id === demobRequestId)
      await supabase.from('demob_requests')
        .update({ status: 'approved', completed_at: now })
        .eq('id', demobRequestId)
      if (req?.assignment_id) {
        await supabase.from('assignments').delete().eq('id', req.assignment_id)
      }
    }

    // Refresh demob data
    const activeOpItem = ops.find((o: any) => o.status === 'active')
    if (activeOpItem) {
      const { data: drData } = await supabase
        .from('demob_requests')
        .select('*, demob_approvals(*)')
        .eq('operational_period_id', activeOpItem.id)
        .order('requested_at', { ascending: false })
      const refreshed = drData ?? []
      setDemobRequests(refreshed)
      setDemobApprovals(refreshed.flatMap((r: any) => r.demob_approvals ?? []))
    }
  }

  async function handleCreateAlert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!alertTitle.trim()) return
    setAlertSubmitting(true)
    setAlertError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAlertSubmitting(false); return }

    const { data: newAlert, error } = await supabase
      .from('event_alerts')
      .insert({
        event_id: id,
        title: alertTitle.trim(),
        message: alertMessage.trim() || null,
        severity: alertSeverity,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      setAlertError(error.message)
      setAlertSubmitting(false)
      return
    }

    if (newAlert) {
      setAlerts(prev => [newAlert, ...prev])
      setAlertTitle('')
      setAlertMessage('')
      setAlertSeverity('warning')
      setShowAlertForm(false)
    }
    setAlertSubmitting(false)
  }

  async function deactivateAlert(alertId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('event_alerts')
      .update({ is_active: false })
      .eq('id', alertId)
    if (!error) {
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    } else {
      console.error('Failed to dismiss alert:', error.message)
    }
  }

  if (!event) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading...</p>
    </div>
  )

  // -- Derived state ------------------------------------------
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

  const isAdmin = isAdminRole(profile?.role)
  const canManage = isAdmin || profile?.role === 'supervisor'

  const pendingDemobRequests = demobRequests.filter((r: any) => r.status === 'pending')
  const myPendingApprovals   = demobApprovals.filter(
    (a: any) => a.approver_user_id === currentUserId && !a.approved_at
  )

  const severityRank: Record<string, number> = { critical: 3, warning: 2, info: 1 }
  const topAlert = alerts.length > 0
    ? [...alerts].sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))[0]
    : null

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">

      {/* -- STICKY HEADER + COMMAND BAR ------------------------- */}
      <header className="sticky top-12 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        {/* Row 1: nav + event name */}
        <div className="px-4 pt-2.5 pb-1.5 max-w-2xl mx-auto flex items-center gap-4">
          <Link
            href="/events"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Events
          </Link>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-sm font-semibold text-[#E5E7EB] truncate">{event.name}</p>
            {event.incident_number && (
              <span className="text-xs font-mono text-[#6B7280]">#{event.incident_number}</span>
            )}
          </div>
        </div>
        {/* Row 2: command status bar */}
        <div className="px-4 pb-2 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 text-[11px] font-mono overflow-x-auto no-scrollbar">
            {activeOp ? (
              <span className="flex items-center gap-1 text-[#22C55E] flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse inline-block" />
                OP {activeOp.period_number} Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#6B7280] flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280] inline-block" />
                No Active OP
              </span>
            )}
            {activeOp && (
              <span className="text-[#6B7280] flex-shrink-0">
                {formatICSTime(activeOp.op_period_start)}–{formatICSTime(activeOp.op_period_end)}
              </span>
            )}
            {activeOpAssignments.length > 0 && (
              <span className="text-[#6B7280] flex-shrink-0">
                {activeOpAssignments.length} personnel
              </span>
            )}
            {alerts.length > 0 ? (
              <span className="flex items-center gap-1 text-[#EF4444] font-semibold flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse inline-block" />
                {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[#22C55E] flex-shrink-0">No alerts</span>
            )}
            {profile?.role && profile.role !== 'member' && (
              <span className="text-[#FF5A1F] ml-auto flex-shrink-0 capitalize">{profile.role}</span>
            )}
          </div>
        </div>
      </header>

      {/* -- INVITE TOAST ------------------------------------------- */}
      {inviteToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4">
          <div className="bg-[#161D26] border border-[#FF5A1F]/30 rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-[#FF5A1F] flex-shrink-0 mt-1.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#E5E7EB]">{inviteToast.title}</p>
              {inviteToast.body && (
                <p className="text-xs text-[#9CA3AF] mt-0.5 truncate">{inviteToast.body}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/events/${id}/meetings`}
                onClick={() => setInviteToast(null)}
                className="text-xs font-semibold text-[#FF5A1F] hover:text-[#FF6A33] transition-colors"
              >
                View →
              </Link>
              <button onClick={() => setInviteToast(null)} className="text-[#6B7280] hover:text-[#9CA3AF] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- CONFIRMATION MODAL ---------------------------------- */}
      {confirming && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-6 max-w-sm w-full">
            <p className="text-[#E5E7EB] font-medium mb-2">Are you sure?</p>
            <p className="text-[#9CA3AF] text-sm mb-6">
              {confirming === 'close-event'
                ? 'This will close the event and all active operational periods. You can reopen it later.'
                : confirming === 'delete-event'
                ? 'This will permanently delete the event and all associated data. This cannot be undone.'
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
                  else if (confirming === 'delete-event') deleteEvent()
                  else if (confirming === 'reopen-event') reopenEvent()
                  else if (confirming.startsWith('close-op-')) closeOP(confirming.replace('close-op-', ''))
                  else if (confirming.startsWith('reopen-op-')) reopenOP(confirming.replace('reopen-op-', ''))
                }}
                className="flex-1 bg-[#EF4444] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 transition-colors"
              >
                {confirming === 'delete-event' ? 'Delete' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="flex-1 bg-transparent text-[#9CA3AF] border border-[#232B36] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2235] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- MAIN CONTENT ---------------------------------------- */}
      <main className="flex-1 px-4 pt-4 sm:pt-6 pb-24 sm:pb-12 max-w-2xl mx-auto w-full">

        {/* 1 · ACTIVE OP STRIP -------------------------------- */}
        {activeOp ? (
          <div className="mb-6 bg-[#FF5A1F]/5 border border-[#FF5A1F]/15 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#FF5A1F] uppercase tracking-wide">Active Period</p>
              <p className="text-sm font-semibold text-[#E5E7EB] mt-0.5">
                Operational Period {activeOp.period_number}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-[#6B7280] mb-0.5">Window</p>
              <p className="text-xs font-mono text-[#9CA3AF]">
                {formatICSTime(activeOp.op_period_start)} — {formatICSTime(activeOp.op_period_end)}
              </p>
            </div>
          </div>
        ) : ops.length > 0 ? (
          <div className="mb-6 bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3.5">
            <p className="text-sm text-[#6B7280]">No active operational period.</p>
          </div>
        ) : null}

        {/* 2 · PRIORITY STRIP -------------------------------- */}
        <div className={`mb-6 border rounded-2xl overflow-hidden transition-all ${
          topAlert?.severity === 'critical' ? 'border-[#EF4444]/40 bg-[#EF4444]/5' :
          topAlert?.severity === 'warning'  ? 'border-[#F59E0B]/35 bg-[#F59E0B]/5' :
          topAlert                          ? 'border-[#3B82F6]/30 bg-[#3B82F6]/5' :
                                              'border-[#232B36] bg-[#161D26]'
        }`}>
          <div className="grid grid-cols-2 divide-x divide-[#232B36]/80">

            {/* Alert cell — clickable when an alert exists */}
            <button
              type="button"
              disabled={!topAlert}
              onClick={() => topAlert && setAlertExpanded(v => !v)}
              className={`px-4 py-3 flex items-center gap-2.5 text-left w-full transition-colors ${
                topAlert ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                topAlert?.severity === 'critical' ? 'bg-[#EF4444] animate-pulse' :
                topAlert?.severity === 'warning'  ? 'bg-[#F59E0B] animate-pulse' :
                topAlert                          ? 'bg-[#3B82F6]' :
                                                    'bg-[#232B36]'
              }`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#6B7280] uppercase tracking-wide font-medium">Alert</p>
                <p className={`text-xs font-semibold mt-0.5 truncate ${
                  topAlert?.severity === 'critical' ? 'text-[#EF4444]' :
                  topAlert?.severity === 'warning'  ? 'text-[#F59E0B]' :
                  topAlert                          ? 'text-[#3B82F6]' :
                                                      'text-[#6B7280]'
                }`}>
                  {topAlert?.title ?? 'No active alerts'}
                </p>
              </div>
              {topAlert && (
                <svg className={`w-3 h-3 flex-shrink-0 text-[#6B7280] transition-transform ${alertExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              )}
            </button>

            {/* Next meeting cell */}
            {(() => {
              const nextMtg = meetings.find(m => new Date(m.start_time) > new Date()) ?? meetings[0] ?? null
              return (
                <Link
                  href={`/events/${id}/meetings`}
                  className="px-4 py-3 flex items-center gap-2.5 hover:bg-white/[0.02] transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 flex-shrink-0 ${nextMtg ? 'text-[#FF5A1F]' : 'text-[#232B36]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[#6B7280] uppercase tracking-wide font-medium">Next Meeting</p>
                    <p className={`text-xs font-semibold mt-0.5 truncate ${nextMtg ? 'text-[#E5E7EB]' : 'text-[#6B7280]'}`}>
                      {nextMtg ? nextMtg.title : 'None scheduled'}
                    </p>
                            {nextMtg && (
                      <p className="text-xs font-mono text-[#FF5A1F]/70 truncate">{formatICSDateTime(nextMtg.start_time)}</p>
                    )}
                    {nextMtg && (() => {
                      // tick re-renders this every 30 s
                      void tick
                      const { label, color } = buildCountdown(nextMtg.start_time, nextMtg.end_time)
                      return <p className={`text-[10px] font-medium mt-0.5 ${color}`}>{label}</p>
                    })()}
                    {nextMtg?.location && (
                      <p className="text-xs text-[#6B7280] truncate">{nextMtg.location}</p>
                    )}
                  </div>
                  {unreadNotifCount > 0 && (
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#FF5A1F] text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                </Link>
              )
            })()}
          </div>

          {/* Expanded alert details */}
          {alertExpanded && topAlert && (
            <div className={`px-4 py-3 border-t ${
              topAlert.severity === 'critical' ? 'border-[#EF4444]/25 bg-[#EF4444]/5' :
              topAlert.severity === 'warning'  ? 'border-[#F59E0B]/20 bg-[#F59E0B]/5' :
                                                 'border-[#3B82F6]/20 bg-[#3B82F6]/5'
            }`}>
              {topAlert.message && (
                <p className="text-sm text-[#E5E7EB] leading-relaxed mb-2">{topAlert.message}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                  topAlert.severity === 'critical' ? 'bg-[#EF4444]/15 text-[#EF4444]' :
                  topAlert.severity === 'warning'  ? 'bg-[#F59E0B]/15 text-[#F59E0B]' :
                                                     'bg-[#3B82F6]/15 text-[#3B82F6]'
                }`}>
                  {topAlert.severity}
                </span>
                {profileMap[topAlert.created_by]?.full_name && (
                  <span className="text-xs text-[#6B7280]">
                    Posted by {profileMap[topAlert.created_by].full_name}
                  </span>
                )}
                <time className="text-xs font-mono text-[#6B7280]">
                  {formatICSDateTime(topAlert.created_at)}
                </time>
                {alerts.length > 1 && (
                  <span className="text-xs text-[#6B7280]">
                    +{alerts.length - 1} more alert{alerts.length > 2 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3 · MY ASSIGNMENT — primary action card ----------- */}
        {myAssignment ? (
          <section className="mb-6">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">My Assignment</p>
            {/* Prominent card with orange left accent */}
            <div className="bg-[#161D26] border border-[#FF5A1F]/30 rounded-2xl overflow-hidden shadow-lg shadow-[#FF5A1F]/5">
              <div className="border-l-4 border-[#FF5A1F] px-4 pt-4 pb-3">
                <p className="text-2xl font-bold text-[#E5E7EB] leading-tight tracking-tight">
                  {getPositionLabel(myAssignment.ics_position)}
                </p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {supervisorProfile && (
                    <span className="text-xs text-[#9CA3AF]">
                      Reports to <span className="text-[#E5E7EB] font-medium">{supervisorProfile.full_name}</span>
                    </span>
                  )}
                  {teammates.length > 0 && (
                    <span className="text-xs text-[#9CA3AF]">
                      <span className="text-[#E5E7EB] font-medium">{teammates.length}</span> teammate{teammates.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {myTeam && !myTeam.name.startsWith('__') && (
                    <span className="text-xs text-[#6B7280]">Team: {myTeam.name}</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-4 pb-4 pt-1 flex items-center gap-2 flex-wrap">
                {/* Call IC */}
                {supervisorProfile?.phone_normalized ? (
                  <a
                    href={`tel:${supervisorProfile.phone_normalized}`}
                    className="inline-flex items-center gap-1.5 bg-[#16A34A] hover:bg-[#15803D] active:bg-[#166534] text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors min-h-[36px]"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.79h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                    </svg>
                    Call {supervisorAssignment ? getPositionLabel(supervisorAssignment.ics_position).split(' ')[0] : 'IC'}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-[#121821] text-[#4B5563] text-xs font-semibold px-3 py-2 rounded-xl border border-[#232B36] min-h-[36px] cursor-not-allowed">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.79h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                    </svg>
                    No IC Phone
                  </span>
                )}
                {/* View Team */}
                <Link
                  href={`/events/${id}/roster`}
                  className="inline-flex items-center gap-1.5 bg-[#121821] hover:bg-[#232B36] border border-[#232B36] hover:border-[#3a4555] text-[#9CA3AF] hover:text-[#E5E7EB] text-xs font-semibold px-3 py-2 rounded-xl transition-colors min-h-[36px]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  View Team
                </Link>
                {/* Log ICS 214 */}
                {activeOp && (
                  <Link
                    href={`/events/${id}/op/${activeOp.id}/log`}
                    className="inline-flex items-center gap-1.5 bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors min-h-[36px] ml-auto"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Log 214
                  </Link>
                )}
              </div>
            </div>
          </section>
        ) : activeOp ? (
          <div className="mb-8 border border-[#232B36] border-dashed rounded-2xl px-4 py-6 text-center">
            <p className="text-sm text-[#6B7280]">You are not assigned to the active operational period.</p>
            <p className="text-xs text-[#6B7280]/70 mt-1">Contact your supervisor to be added.</p>
          </div>
        ) : null}

        {/* 3b · PERSONNEL — collapsible sections ------------ */}
        {activeOp && activeOpAssignments.length > 0 && (() => {
          // Short role tags for display — keyed by ics_position value
          const ROLE_TAG: Record<string, { tag: string; color: string }> = {
            incident_commander:          { tag: 'IC',        color: '#FF5A1F' },
            deputy_incident_commander:   { tag: 'Dep IC',    color: '#FF5A1F' },
            safety_officer:              { tag: 'Safety',    color: '#EF4444' },
            public_information_officer:  { tag: 'PIO',       color: '#F59E0B' },
            liaison_officer:             { tag: 'Liaison',   color: '#F59E0B' },
            agency_representative:       { tag: 'Agency',    color: '#6B7280' },
            operations_section_chief:    { tag: 'Ops Chief', color: '#22C55E' },
            operations_section_deputy:   { tag: 'Ops Dep',   color: '#22C55E' },
            planning_section_chief:      { tag: 'Pln Chief', color: '#3B82F6' },
            logistics_section_chief:     { tag: 'Log Chief', color: '#8B5CF6' },
            finance_admin_section_chief: { tag: 'Fin Chief', color: '#6B7280' },
            branch_director:             { tag: 'Branch Dir',color: '#FB923C' },
            division_supervisor:         { tag: 'Div Sup',   color: '#38BDF8' },
            division_group_supervisor:   { tag: 'Div/Grp',   color: '#38BDF8' },
            group_supervisor:            { tag: 'Grp Sup',   color: '#A3E635' },
            team_leader:                 { tag: 'Team Lead', color: '#94A3B8' },
            staging_area_manager:        { tag: 'Staging',   color: '#22C55E' },
            air_ops_branch_director:     { tag: 'Air Ops',   color: '#22C55E' },
          }

          // Priority order — leaders first
          const LEADER_PRIORITY = [
            'incident_commander','deputy_incident_commander','safety_officer',
            'public_information_officer','liaison_officer',
            'operations_section_chief','planning_section_chief',
            'logistics_section_chief','finance_admin_section_chief',
            'branch_director','division_supervisor','division_group_supervisor',
            'group_supervisor','team_leader',
          ]
          const rank = (pos: string) => {
            const i = LEADER_PRIORITY.indexOf(pos)
            return i === -1 ? 999 : i
          }
          return (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                  Personnel
                  <span className="ml-2 font-mono text-[#4B5563] normal-case">{activeOpAssignments.length}</span>
                </p>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/events/${id}/op/${activeOp.id}/staff`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#22C55E] hover:text-[#34D399] transition-colors py-1 px-2 rounded-lg hover:bg-[#161D26]"
                  >
                    Org Chart
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                  <Link
                    href={`/events/${id}/roster`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#E5E7EB] transition-colors py-1 px-2 -mr-2 rounded-lg hover:bg-[#161D26]"
                  >
                    Full Roster
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                </div>
              </div>

              {/* Status legend */}
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                  <span className="w-2 h-2 rounded-full bg-[#22C55E] inline-block" /> Active
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B] inline-block" /> Warning
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block" /> Not checked in
                </span>
              </div>

              {/* Collapsible sections */}
              <div className="space-y-2">
                {PERSONNEL_SECTIONS.map(section => {
                  const sectionAssignments = activeOpAssignments.filter((a: any) => section.positions.has(a.ics_position))
                  if (sectionAssignments.length === 0) return null
                  const isExpanded = expandedSections.has(section.label)
                  const LEADER_PRIORITY = [
                    'incident_commander','deputy_incident_commander','safety_officer',
                    'public_information_officer','liaison_officer',
                    'operations_section_chief','planning_section_chief',
                    'logistics_section_chief','finance_admin_section_chief',
                    'branch_director','division_supervisor','division_group_supervisor',
                    'group_supervisor','team_leader',
                  ]
                  const rank = (pos: string) => { const i = LEADER_PRIORITY.indexOf(pos); return i === -1 ? 999 : i }
                  const sortedSection = [...sectionAssignments].sort((a, b) => rank(a.ics_position) - rank(b.ics_position))

                  return (
                    <div key={section.label} className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
                      {/* Section header — clickable to expand/collapse */}
                      <button
                        type="button"
                        onClick={() => toggleSection(section.label)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a2235] active:bg-[#1a2235] transition-colors select-none"
                      >
                        {/* Colored section dot */}
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
                        {/* Section name — left-aligned, bold */}
                        <span className="text-xs font-bold uppercase tracking-widest flex-1 text-left" style={{ color: section.color }}>
                          {section.label}
                        </span>
                        {/* Count badge */}
                        <span
                          className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mr-1.5 tabular-nums"
                          style={{ color: section.color, backgroundColor: section.color + '18' }}
                        >
                          {sectionAssignments.length}
                        </span>
                        {/* Chevron */}
                        <svg
                          className="w-3.5 h-3.5 text-[#4B5563] flex-shrink-0 transition-transform duration-200"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        >
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>

                      {/* Animated section body */}
                      <div
                        className="overflow-hidden transition-all duration-200 ease-out"
                        style={{ maxHeight: isExpanded ? `${sortedSection.length * 56 + 8}px` : '0px' }}
                      >
                      {sortedSection.map((a: any, i: number) => {
                        const p = profileMap[a.user_id]
                        const name = p?.full_name ?? 'Unknown'
                        const roleTag = ROLE_TAG[a.ics_position]
                        const badgeColor = roleTag ? badgeColorForPosition(a.ics_position) : null
                        const isLast = i === sortedSection.length - 1
                        const phoneNormalized = p?.phone_normalized ?? null
                        const status = activityStatus(a.user_id, lastEntryMap)
                        return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedPerson({ assignment: a, prof: p })}
                            onKeyDown={e => e.key === 'Enter' && setSelectedPerson({ assignment: a, prof: p })}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a2235] transition-colors cursor-pointer border-t border-[#232B36]/40"
                          >
                            {/* Status dot */}
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
                              data-status={status}
                            />
                            {/* Avatar */}
                            <div className="w-7 h-7 rounded-full bg-[#121821] border border-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                              {getInitials(name)}
                            </div>
                            {/* Name + role */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-sm font-medium text-[#E5E7EB] truncate">{name}</p>
                                {roleTag && badgeColor && (
                                  <span className="text-[10px] font-bold px-1.5 py-px rounded flex-shrink-0 font-mono" style={{ color: badgeColor, backgroundColor: badgeColor + '18' }}>
                                    {roleTag.tag}
                                  </span>
                                )}
                                {a.user_id === currentUserId && (
                                  <span className="text-[10px] font-semibold text-[#FF5A1F] bg-[#FF5A1F]/10 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">You</span>
                                )}
                              </div>
                              <p className="text-xs text-[#4B5563] truncate leading-tight mt-px">{getPositionLabel(a.ics_position)}</p>
                            </div>
                            {/* Call + Text buttons */}
                            <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              {phoneNormalized ? (
                                <a
                                  href={`tel:${phoneNormalized}`}
                                  aria-label={`Call ${name}`}
                                  className="inline-flex items-center gap-1 bg-[#16A34A] hover:bg-[#15803D] active:bg-[#166534] text-white text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors min-h-[32px]"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.79h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                                  </svg>
                                  <span className="hidden sm:inline">Call</span>
                                </a>
                              ) : null}
                              {/* Text placeholder */}
                              <button
                                type="button"
                                disabled
                                title="SMS coming soon"
                                className="inline-flex items-center gap-1 bg-[#121821] border border-[#232B36] text-[#4B5563] text-xs font-semibold px-2.5 py-1.5 rounded-full min-h-[32px] cursor-not-allowed"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      </div>{/* end animated body */}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })()}

        {/* 3c · DEMOB APPROVALS (shown when user has pending approvals) */}
        {myPendingApprovals.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#F59E0B] uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
                Demob Approvals Needed
              </p>
              <span className="text-xs font-mono text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
                {myPendingApprovals.length}
              </span>
            </div>
            <div className="bg-[#161D26] border border-[#F59E0B]/20 rounded-2xl overflow-hidden divide-y divide-[#232B36]/60">
              {myPendingApprovals.map((approval: any) => {
                const req = demobRequests.find((r: any) => r.id === approval.demob_request_id)
                const person = profileMap[req?.user_id]
                const personAssignment = activeOp
                  ? assignments.find((a: any) => a.user_id === req?.user_id && a.operational_period_id === activeOp.id)
                  : null
                return (
                  <div key={approval.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#E5E7EB]">
                        {person?.full_name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-[#6B7280] mt-px">
                        {personAssignment ? getPositionLabel(personAssignment.ics_position) : '—'}
                        <span className="text-[#374151] mx-1">·</span>
                        Requested {req ? new Date(req.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => approveDemob(approval.id, approval.demob_request_id)}
                      className="flex-shrink-0 text-xs font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Approve
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 3d · ADMIN DEMOB CLOSEOUT */}
        {canManage && pendingDemobRequests.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Pending Demob</p>
              <Link
                href={`/events/${id}/demob-config`}
                className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors py-1 px-2 -mr-2 rounded-lg hover:bg-[#161D26]"
              >
                Configure →
              </Link>
            </div>
            <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden divide-y divide-[#232B36]/60">
              {pendingDemobRequests.map((req: any) => {
                const person = profileMap[req.user_id]
                const personAssignment = activeOp
                  ? assignments.find((a: any) => a.user_id === req.user_id && a.operational_period_id === activeOp.id)
                  : null
                const approvals: any[] = req.demob_approvals ?? []
                const approvedCount = approvals.filter((a: any) => a.approved_at).length
                return (
                  <div key={req.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#F59E0B] flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#E5E7EB]">{person?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-[#6B7280] mt-px">
                          {personAssignment ? getPositionLabel(personAssignment.ics_position) : '—'}
                        </p>
                      </div>
                      {approvals.length > 0 && (
                        <span className="text-[10px] font-mono text-[#F59E0B] flex-shrink-0">
                          {approvedCount}/{approvals.length} approved
                        </span>
                      )}
                      {approvals.length === 0 && (
                        <span className="text-[10px] font-mono text-[#6B7280] flex-shrink-0">no approvers</span>
                      )}
                    </div>
                    {approvals.length > 0 && (
                      <div className="flex gap-2 mt-2 pl-5 flex-wrap">
                        {approvals.map((a: any) => (
                          <span
                            key={a.id}
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              a.approved_at
                                ? 'text-[#22C55E] bg-[#22C55E]/10'
                                : 'text-[#F59E0B] bg-[#F59E0B]/10'
                            }`}
                          >
                            {getPositionLabel(a.approver_position)} {a.approved_at ? '✓' : '…'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 4 · PRIMARY CTA ------------------------------------ */}
        {myAssignment && activeOp && (
          <div className="mb-8">
            <Link
              href={`/events/${id}/op/${activeOp.id}/log`}
              className="w-full flex items-center justify-center gap-2.5 bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.98] text-white px-6 py-4 rounded-2xl text-base font-bold transition-all shadow-lg shadow-[#FF5A1F]/10 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Log ICS 214 – OP {activeOp.period_number}
            </Link>
          </div>
        )}

        {/* 4b · ICS 214 QUICK ACCESS (admin/supervisor, not assigned) -- */}
        {canManage && !myAssignment && activeOp && (
          <div className="mb-8">
            <Link
              href={`/events/${id}/op/${activeOp.id}/review`}
              className="w-full flex items-center gap-3 bg-[#161D26] border border-[#232B36] hover:border-[#FF5A1F]/30 hover:bg-[#1a2235] rounded-2xl px-4 py-3.5 transition-all duration-150 group"
            >
              <div className="w-9 h-9 rounded-xl bg-[#121821] border border-[#232B36] flex items-center justify-center text-[#FF5A1F] group-hover:bg-[#FF5A1F]/10 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#E5E7EB]">ICS 214 Logs</p>
                <p className="text-xs text-[#6B7280] mt-0.5">Review activity logs — OP {activeOp.period_number}</p>
              </div>
              <svg className="w-4 h-4 text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          </div>
        )}

        {/* 4c · MEETINGS ------------------------------------- */}
        {(meetings.length > 0 || isAdmin) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                {isAdmin ? 'Meetings' : 'My Meetings'}
              </p>
              <Link
                href={`/events/${id}/meetings`}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#E5E7EB] transition-colors py-1 px-2 -mr-2 rounded-lg hover:bg-[#161D26]"
              >
                {isAdmin ? 'Manage' : 'View all'}
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>
            {meetings.length === 0 ? (
              <div className="bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-4 flex items-center justify-between">
                <p className="text-sm text-[#6B7280]">No meetings scheduled yet.</p>
                {isAdmin && (
                  <Link href={`/events/${id}/meetings`} className="text-xs text-[#FF5A1F] hover:text-[#FF6A33] font-medium transition-colors">
                    Schedule one →
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {meetings.slice(0, 3).map(mtg => {
                  const start = new Date(mtg.start_time)
                  const isPast = start < new Date()
                  return (
                    <Link
                      key={mtg.id}
                      href={`/events/${id}/meetings`}
                      className="block bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3 hover:bg-[#1a2235] hover:border-[#3a4555] transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${isPast ? 'text-[#6B7280]' : 'text-[#E5E7EB]'}`}>
                            {mtg.title}
                          </p>
                          <p className="text-xs font-mono text-[#FF5A1F]/80 mt-0.5">
                            {formatICSDateTime(mtg.start_time)}
                          </p>
                          {mtg.location && (
                            <p className="text-xs text-[#6B7280] mt-0.5 truncate">{mtg.location}</p>
                          )}
                        </div>
                        {isPast ? (
                          <span className="flex-shrink-0 text-xs text-[#6B7280] bg-[#121821] px-2 py-0.5 rounded-full">Past</span>
                        ) : (
                          <span className="flex-shrink-0 text-xs text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-[#22C55E]/20">Upcoming</span>
                        )}
                      </div>
                    </Link>
                  )
                })}
                {meetings.length > 3 && (
                  <Link href={`/events/${id}/meetings`} className="block text-center text-xs text-[#6B7280] hover:text-[#9CA3AF] py-2 transition-colors">
                    +{meetings.length - 3} more meeting{meetings.length - 3 !== 1 ? 's' : ''}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5 · RECENT ACTIVITY — live feed ------------------- */}
        {recentEntries.length > 0 && activeOp && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">My Recent Logs</p>
              <Link
                href={`/events/${id}/op/${activeOp.id}/log`}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#E5E7EB] transition-colors py-1 px-2 -mr-2 rounded-lg hover:bg-[#161D26]"
              >
                View all
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden divide-y divide-[#232B36]/50">
              {recentEntries.map(entry => (
                <Link
                  key={entry.id}
                  href={`/events/${id}/op/${activeOp.id}/log`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-[#1a2235] transition-colors"
                >
                  {/* ICS 214 log icon */}
                  <div className="w-7 h-7 rounded-lg bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-[#FF5A1F]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <p className="text-xs font-semibold text-[#9CA3AF]">{profile?.full_name}</p>
                      <time className="text-[10px] font-mono text-[#4B5563] flex-shrink-0">{formatICSDateTime(entry.entry_time)}</time>
                    </div>
                    <p className="text-sm text-[#E5E7EB] leading-snug mt-0.5 line-clamp-2">{entry.narrative}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* -- DIVIDER -------------------------------------------- */}
        {canManage && <div className="border-t border-[#232B36]/60 mb-8" />}

        {/* 5 · MANAGEMENT SECTION (admin / supervisor) -------- */}
        {canManage && (
          <section>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide flex-1">
                Operational Periods
              </p>
              {isAdmin && (
                <>
                  <Link
                    href={`/events/${id}/op/new`}
                    className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                  >
                    + Add Period
                  </Link>
                  <Link
                    href={`/api/events/${id}/export`}
                    className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                  >
                    Export All
                  </Link>
                  {event.status === 'active' ? (
                    <button
                      onClick={() => setConfirming('close-event')}
                      className="text-xs text-[#EF4444]/50 hover:text-[#EF4444] transition-colors"
                    >
                      Close Event
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirming('reopen-event')}
                      className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                    >
                      Reopen Event
                    </button>
                  )}
                  <button
                    onClick={() => setConfirming('delete-event')}
                    className="text-xs text-[#EF4444]/40 hover:text-[#EF4444] transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>

            {ops.length === 0 ? (
              <div className="border border-[#232B36] border-dashed rounded-2xl p-8 text-center">
                <p className="text-[#6B7280] text-sm">No operational periods yet.</p>
                {isAdmin && (
                  <Link href={`/events/${id}/op/new`}
                    className="inline-block mt-3 text-[#FF5A1F] text-sm hover:underline">
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
                    <div key={op.id} className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => toggleOp(op.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#121821] border border-[#232B36] text-[#9CA3AF] hover:bg-[#232B36] hover:text-[#E5E7EB] flex-shrink-0 transition-all"
                          >
                            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M6 9l6 6 6-6"/>
                            </svg>
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-[#E5E7EB]">
                                Operational Period {op.period_number}
                              </p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
                                op.status === 'active'
                                  ? 'bg-[#22C55E]/10 text-[#22C55E] ring-[#22C55E]/20'
                                  : 'bg-[#6B7280]/10 text-[#6B7280] ring-[#6B7280]/20'
                              }`}>
                                {op.status}
                              </span>
                            </div>
                            <p className="text-xs font-mono text-[#6B7280] mt-0.5">
                              {formatDate(op.op_period_start)} {formatICSTime(op.op_period_start)} — {formatICSTime(op.op_period_end)}
                            </p>
                          </div>
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {isAdmin && (
                              <>
                                <Link
                                  href={`/events/${id}/op/${op.id}/dashboard`}
                                  className="text-xs text-[#FF5A1F] hover:text-[#FF6A33] transition-colors font-medium"
                                >
                                  Dashboard
                                </Link>
                                <Link
                                  href={`/events/${id}/op/${op.id}/staff`}
                                  className="text-xs text-[#22C55E] hover:text-[#34D399] transition-colors font-medium"
                                >
                                  Org Chart
                                </Link>
                              </>
                            )}
                            <Link
                              href={`/events/${id}/op/${op.id}/review`}
                              className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                            >
                              Review
                            </Link>
                            {isAdmin && (
                              op.status === 'active' ? (
                                <button
                                  onClick={() => setConfirming(`close-op-${op.id}`)}
                                  className="text-xs text-[#EF4444]/50 hover:text-[#EF4444] transition-colors"
                                >
                                  Demob
                                </button>
                              ) : (
                                <button
                                  onClick={() => setConfirming(`reopen-op-${op.id}`)}
                                  className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                                >
                                  Reopen
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>

                      <div className="px-4 pb-3 flex gap-2 flex-wrap">
                        {myOpAssignment && (
                          <Link
                            href={`/events/${id}/op/${op.id}/log`}
                            className="bg-[#FF5A1F] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#FF6A33] transition-colors"
                          >
                            Open My 214
                          </Link>
                        )}
                        {canManage && (
                          <Link
                            href={`/api/events/${id}/op/${op.id}/export/all`}
                            className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                          >
                            Export OP {op.period_number}
                          </Link>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[#232B36]">
                          {opAssignments.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-[#6B7280]">No personnel assigned yet.</p>
                          ) : (
                            <div className="px-4 py-3">
                              {opTeams.filter((t: any) => !t.group_id).map((team: any) => {
                                const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                                return (
                                  <div key={team.id} className="mb-3">
                                    <p className="text-xs text-[#6B7280] mb-1 font-mono">Team: {team.name}</p>
                                    {teamMembers.map((a: any) => {
                                      const p = profileMap[a.user_id]
                                      return (
                                        <Link key={a.id}
                                          href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                          className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity">
                                          <div className="w-6 h-6 rounded-full bg-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                                            {getInitials(p?.full_name ?? '?')}
                                          </div>
                                          <span className="text-xs text-[#E5E7EB]">{p?.full_name ?? 'Unknown'}</span>
                                          <span className="text-xs text-[#6B7280]">{a.ics_position.replace(/_/g, ' ')}</span>
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
                                    <p className="text-xs text-[#9CA3AF] mb-1 font-mono">Group: {grp.name}</p>
                                    {grpTeams.map((team: any) => {
                                      const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                                      return (
                                        <div key={team.id} className="ml-3 mb-2">
                                          <p className="text-xs text-[#6B7280] mb-1">Team: {team.name}</p>
                                          {teamMembers.map((a: any) => {
                                            const p = profileMap[a.user_id]
                                            return (
                                              <Link key={a.id}
                                                href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                                className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity">
                                                <div className="w-6 h-6 rounded-full bg-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                                                  {getInitials(p?.full_name ?? '?')}
                                                </div>
                                                <span className="text-xs text-[#E5E7EB]">{p?.full_name ?? 'Unknown'}</span>
                                                <span className="text-xs text-[#6B7280]">{a.ics_position.replace(/_/g, ' ')}</span>
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
                                    <p className="text-xs font-mono text-[#9CA3AF] uppercase tracking-wider mb-2">
                                      {div.type === 'branch' ? 'Branch' : 'Division'}: {div.name}
                                    </p>
                                    {divGroups.map((grp: any) => {
                                      const grpTeams = opTeams.filter((t: any) => t.group_id === grp.id)
                                      return (
                                        <div key={grp.id} className="ml-3 mb-2">
                                          <p className="text-xs text-[#6B7280] mb-1">Group: {grp.name}</p>
                                          {grpTeams.map((team: any) => {
                                            const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                                            return (
                                              <div key={team.id} className="ml-3 mb-2">
                                                <p className="text-xs text-[#6B7280] mb-1">Team: {team.name}</p>
                                                {teamMembers.map((a: any) => {
                                                  const p = profileMap[a.user_id]
                                                  return (
                                                    <Link key={a.id}
                                                      href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                                      className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity">
                                                      <div className="w-6 h-6 rounded-full bg-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                                                        {getInitials(p?.full_name ?? '?')}
                                                      </div>
                                                      <span className="text-xs text-[#E5E7EB]">{p?.full_name ?? 'Unknown'}</span>
                                                      <span className="text-xs text-[#6B7280]">{a.ics_position.replace(/_/g, ' ')}</span>
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
                          <div className="px-4 py-2 border-t border-[#232B36] bg-[#0B0F14]/50">
                            <p className="text-xs text-[#6B7280]">{opAssignments.length} personnel assigned</p>
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

        {/* 5b · NON-MANAGER: read-only periods list ----------- */}
        {!canManage && ops.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">All Periods</p>
            <div className="space-y-2">
              {ops.map((op: any) => {
                const myOpA = assignments.find(
                  (a: any) => a.operational_period_id === op.id && a.user_id === currentUserId
                )
                return (
                  <div key={op.id}
                    className="flex items-center justify-between bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#E5E7EB]">Operational Period {op.period_number}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
                          op.status === 'active'
                            ? 'bg-[#22C55E]/10 text-[#22C55E] ring-[#22C55E]/20'
                            : 'bg-[#6B7280]/10 text-[#6B7280] ring-[#6B7280]/20'
                        }`}>
                          {op.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[#6B7280] mt-0.5">
                        {formatICSTime(op.op_period_start)} — {formatICSTime(op.op_period_end)}
                      </p>
                    </div>
                    {myOpA && (
                      <Link
                        href={`/events/${id}/op/${op.id}/log`}
                        className="text-xs bg-transparent text-[#9CA3AF] border border-[#232B36] px-3 py-1.5 rounded-lg font-medium hover:bg-[#161D26] hover:border-[#3a4555] transition-colors"
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

        {/* 7 · ALERT MANAGEMENT (admin only) ----------------- */}
        {isAdmin && (
          <section className="mt-2">
            {deleteError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-[#EF4444]/5 border border-[#EF4444]/25 text-xs text-[#EF4444] font-mono break-all">
                Delete failed: {deleteError}
              </div>
            )}
            <div className="border-t border-[#232B36]/60 pt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#EF4444]/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                    Command Alerts
                  </p>
                  {alerts.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EF4444]/10 text-[#EF4444]">
                      {alerts.length} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowAlertForm(v => !v)}
                  className="text-xs text-[#FF5A1F] hover:text-[#FF6A33] transition-colors"
                >
                  {showAlertForm ? 'Cancel' : '+ New Alert'}
                </button>
              </div>

              {/* Create form */}
              {showAlertForm && (
                <form onSubmit={handleCreateAlert} className="mb-4 bg-[#161D26] border border-[#232B36] rounded-2xl p-4 space-y-3">
                  <input
                    value={alertTitle}
                    onChange={e => setAlertTitle(e.target.value)}
                    placeholder="Alert title"
                    maxLength={120}
                    required
                    className="input"
                  />
                  <textarea
                    value={alertMessage}
                    onChange={e => setAlertMessage(e.target.value)}
                    placeholder="Additional details (optional)"
                    rows={2}
                    className="input resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={alertSeverity}
                      onChange={e => setAlertSeverity(e.target.value)}
                      className="input flex-1"
                    >
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                    <button
                      type="submit"
                      disabled={!alertTitle.trim() || alertSubmitting}
                      className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-40 disabled:pointer-events-none text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {alertSubmitting ? 'Posting…' : 'Post Alert'}
                    </button>
                  </div>
                  {alertError && (
                    <p className="text-xs text-[#EF4444] mt-2 font-mono bg-[#EF4444]/5 border border-[#EF4444]/25 rounded-lg px-3 py-2 break-all">
                      {alertError}
                    </p>
                  )}
                </form>
              )}

              {/* Active alerts list */}
              {alerts.length === 0 ? (
                <p className="text-xs text-[#6B7280] py-1">No active alerts.</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`rounded-2xl px-4 py-3 border ${
                        alert.severity === 'critical' ? 'bg-[#EF4444]/5 border-[#EF4444]/25' :
                        alert.severity === 'warning'  ? 'bg-[#F59E0B]/5 border-[#F59E0B]/25' :
                                                        'bg-[#3B82F6]/5 border-[#3B82F6]/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                            alert.severity === 'critical' ? 'bg-[#EF4444] animate-pulse' :
                            alert.severity === 'warning'  ? 'bg-[#F59E0B] animate-pulse' :
                                                            'bg-[#3B82F6]'
                          }`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-xs font-semibold ${
                                alert.severity === 'critical' ? 'text-[#EF4444]' :
                                alert.severity === 'warning'  ? 'text-[#F59E0B]' :
                                                                'text-[#3B82F6]'
                              }`}>{alert.title}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
                                alert.severity === 'critical' ? 'text-[#EF4444] bg-[#EF4444]/15' :
                                alert.severity === 'warning'  ? 'text-[#F59E0B] bg-[#F59E0B]/15' :
                                                                'text-[#3B82F6] bg-[#3B82F6]/15'
                              }`}>
                                {alert.severity}
                              </span>
                            </div>
                            {alert.message && (
                              <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">{alert.message}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <p className="text-xs text-[#6B7280] font-mono">
                                {formatICSDateTime(alert.created_at)}
                              </p>
                              {profileMap[alert.created_by]?.full_name && (
                                <p className="text-xs text-[#6B7280]">
                                  by {profileMap[alert.created_by].full_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => deactivateAlert(alert.id)}
                          className="text-xs text-[#6B7280] hover:text-[#EF4444] transition-colors flex-shrink-0 mt-0.5"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

      </main>

      {/* -- FLOATING ACTION BAR (mobile-first, minimal on desktop) -- */}
      {activeOp && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F14]/95 backdrop-blur-sm border-t border-[#232B36] px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2 max-w-sm mx-auto">
            {/* Call IC */}
            {supervisorProfile?.phone_normalized ? (
              <a
                href={`tel:${supervisorProfile.phone_normalized}`}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-[#161D26] border border-[#232B36] hover:bg-[#1a2235] transition-colors"
              >
                <svg className="w-4 h-4 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.79h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                </svg>
                <span className="text-[10px] font-semibold text-[#9CA3AF]">Call IC</span>
              </a>
            ) : (
              <div className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-[#161D26] border border-[#232B36] opacity-40 cursor-not-allowed">
                <svg className="w-4 h-4 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.79h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                </svg>
                <span className="text-[10px] font-semibold text-[#6B7280]">Call IC</span>
              </div>
            )}
            {/* Log ICS 214 — primary action */}
            {myAssignment ? (
              <Link
                href={`/events/${id}/op/${activeOp.id}/log`}
                className="flex-[2] flex flex-col items-center gap-1 py-2 rounded-xl bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] transition-colors"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span className="text-[10px] font-bold text-white">Log ICS 214</span>
              </Link>
            ) : (
              <div className="flex-[2] flex flex-col items-center gap-1 py-2 rounded-xl bg-[#161D26] border border-[#232B36] opacity-40 cursor-not-allowed">
                <svg className="w-4 h-4 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span className="text-[10px] font-semibold text-[#6B7280]">Log ICS 214</span>
              </div>
            )}
            {/* Roster */}
            <Link
              href={`/events/${id}/roster`}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl bg-[#161D26] border border-[#232B36] hover:bg-[#1a2235] transition-colors"
            >
              <svg className="w-4 h-4 text-[#9CA3AF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="text-[10px] font-semibold text-[#9CA3AF]">Roster</span>
            </Link>
          </div>
        </div>
      )}

      {/* -- PERSON DETAIL OVERLAY ------------------------------ */}
      {selectedPerson && (() => {
        const { assignment: a, prof: p } = selectedPerson
        const status = activityStatus(a.user_id, lastEntryMap)
        const statusLabel = status === 'active' ? 'Active' : status === 'warning' ? 'Warning' : 'Not checked in'
        return (
          <div
            className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
            onClick={() => setSelectedPerson(null)}
          >
            <div
              className="bg-[#161D26] border border-[#232B36] rounded-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#121821] border border-[#232B36] flex items-center justify-center text-sm font-mono text-[#9CA3AF]">
                    {getInitials(p?.full_name ?? '?')}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#E5E7EB]">{p?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-[#6B7280] mt-px">{getPositionLabel(a.ics_position)}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedPerson(null)} className="text-[#6B7280] hover:text-[#9CA3AF] transition-colors mt-0.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-5 pb-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_DOT_COLOR[status] }} />
                <span className="text-xs text-[#9CA3AF]">{statusLabel}</span>
                {a.dual_hatted && (
                  <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-px rounded font-mono">Dual-hatted</span>
                )}
              </div>
              {(p?.phone || p?.phone_normalized) && (
                <div className="px-5 pb-3">
                  <p className="text-xs text-[#6B7280]">Phone</p>
                  <p className="text-sm font-mono text-[#E5E7EB] mt-0.5">{p.phone ?? p.phone_normalized}</p>
                </div>
              )}
              <div className="px-5 pb-5 flex gap-2">
                {p?.phone_normalized ? (
                  <a
                    href={`tel:${p.phone_normalized}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2.79h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
                    </svg>
                    Call
                  </a>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2 bg-[#121821] border border-[#232B36] text-[#4B5563] text-sm font-semibold py-2.5 rounded-xl cursor-not-allowed">
                    No Phone
                  </div>
                )}
                <button
                  type="button"
                  disabled
                  title="SMS coming soon"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#121821] border border-[#232B36] text-[#4B5563] text-sm font-semibold py-2.5 rounded-xl cursor-not-allowed"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Text
                </button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
