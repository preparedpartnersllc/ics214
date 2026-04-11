'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import {
  getPositionLabel,
  COMMAND_STAFF_POSITIONS,
  OPERATIONS_POSITIONS,
  PLANNING_POSITIONS,
  LOGISTICS_POSITIONS,
  FINANCE_POSITIONS,
} from '@/lib/ics-positions'
import Link from 'next/link'
import { activityStatus, fmtAgo, STATUS_DOT_COLOR, fetchLastEntryMap, type LastEntryMap } from '@/lib/accountability'

const UNIQUE_POSITIONS = new Set([
  'team_leader','group_supervisor','division_supervisor','branch_director',
  'incident_commander','deputy_incident_commander','safety_officer',
  'public_information_officer','liaison_officer',
  'operations_section_chief','planning_section_chief',
  'logistics_section_chief','finance_admin_section_chief',
])

const COMMAND_SLOTS = [
  { position: 'incident_commander',         label: 'Incident Commander'  },
  { position: 'deputy_incident_commander',  label: 'Deputy IC'           },
  { position: 'safety_officer',             label: 'Safety Officer'      },
  { position: 'public_information_officer', label: 'Public Info Officer' },
  { position: 'liaison_officer',            label: 'Liaison Officer'     },
]

const SECTION_DEFS = [
  { key: 'planning',  label: 'Planning Section',  sysKey: '__planning__',  positions: PLANNING_POSITIONS  },
  { key: 'logistics', label: 'Logistics Section', sysKey: '__logistics__', positions: LOGISTICS_POSITIONS },
  { key: 'finance',   label: 'Finance / Admin',   sysKey: '__finance__',   positions: FINANCE_POSITIONS   },
]

export default function StaffPage() {
  const params  = useParams()
  const eventId = params.id as string
  const opId    = params.opId as string

  const [op, setOp]                   = useState<any>(null)
  const [profiles, setProfiles]       = useState<any[]>([])
  const [profileMap, setProfileMap]   = useState<Record<string, any>>({})
  const [assignments, setAssignments] = useState<any[]>([])
  const [divisions, setDivisions]     = useState<any[]>([])
  const [groups, setGroups]           = useState<any[]>([])
  const [teams, setTeams]             = useState<any[]>([])
  const [agencyReps, setAgencyReps]   = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)

  // Staging panel
  const [stagingQuery, setStagingQuery]           = useState('')
  const [mobileStagingOpen, setMobileStagingOpen] = useState(false)

  // Agency rep manual add
  const [showAddRep, setShowAddRep]       = useState(false)
  const [addingRepName, setAddingRepName] = useState('')
  const [addingRepAgency, setAddingRepAgency] = useState('')

  // DnD — track profile drags (from staging) and assignment drags (from filled slots) separately
  const [draggingProfileId, setDraggingProfileId]       = useState<string | null>(null)
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null)
  const [draggingGroupId, setDraggingGroupId]           = useState<string | null>(null)
  const [dragOverKey, setDragOverKey]                   = useState<string | null>(null)
  const [dragOverDivId, setDragOverDivId]               = useState<string | null>(null)

  // Accountability — latest ICS 214 entry per user for this OP
  const [lastEntryMap, setLastEntryMap] = useState<LastEntryMap>({})

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Drag overlay — custom floating card that follows the pointer
  const [dragOverlayData, setDragOverlayData] = useState<{ name: string; sub: string } | null>(null)
  // Overlay element ref — position updated via direct style mutation to avoid
  // React state updates during dragover, which would re-render the entire tree
  // at 60fps and unmount/remount the nested sub-components (EmptySlot, FilledSlot,
  // etc.), destroying their DOM nodes before the drop event can fire on them.
  const overlayRef = useRef<HTMLDivElement | null>(null)
  // Ghost element held in the DOM during a drag so setDragImage has a valid target
  const dragGhostRef = useRef<HTMLDivElement | null>(null)

  // Click-to-assign modal (used for both staging→assign and mobile move)
  const [assigningProfile, setAssigningProfile] = useState<any | null>(null)
  const [movingAssignmentId, setMovingAssignmentId] = useState<string | null>(null)
  const [caSection, setCaSection]               = useState('command')
  const [caTeamId, setCaTeamId]                 = useState('')
  const [caPosition, setCaPosition]             = useState('')
  const [caError, setCaError]                   = useState<string | null>(null)
  const [caSaving, setCaSaving]                 = useState(false)

  // Mobile action sheet — tap an assigned card to move or unassign
  const [mobileActionSheet, setMobileActionSheet] = useState<{
    assignment: any; profile: any
  } | null>(null)

  // Inline structure creation
  const [showAddGroup, setShowAddGroup]           = useState(false)
  const [addingGroupName, setAddingGroupName]     = useState('')
  const [addingTeamToGroup, setAddingTeamToGroup] = useState<string | null>(null)
  const [addingTeamName, setAddingTeamName]       = useState('')
  const [showAddUnit, setShowAddUnit]             = useState<'division' | 'branch' | null>(null)
  const [addingUnitName, setAddingUnitName]       = useState('')

  useEffect(() => { load() }, [opId])

  // Track cursor via dragover and move overlay via direct DOM mutation — no setState
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (overlayRef.current) {
        overlayRef.current.style.left = `${e.clientX + 14}px`
        overlayRef.current.style.top  = `${e.clientY - 14}px`
      }
    }
    document.addEventListener('dragover', onDragOver)
    return () => document.removeEventListener('dragover', onDragOver)
  }, [])

  async function load() {
    const supabase = createClient()
    const [
      { data: opData }, { data: pData }, { data: aData },
      { data: divData }, { data: grpData }, { data: teamData },
      { data: repData }, entryMap,
    ] = await Promise.all([
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('divisions').select('*').eq('operational_period_id', opId),
      supabase.from('groups').select('*').eq('operational_period_id', opId),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
      supabase.from('agency_reps').select('*').eq('operational_period_id', opId).order('created_at'),
      fetchLastEntryMap(supabase, opId),
    ])
    setOp(opData)
    setProfiles(pData ?? [])
    setProfileMap((pData ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {}))
    setAssignments(aData ?? [])
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])
    setAgencyReps(repData ?? [])
    setLastEntryMap(entryMap)
    setLoading(false)
  }

  // ── Derived ──────────────────────────────────────────────────────
  const assignedUserIds = useMemo(
    () => new Set(assignments.map((a: any) => a.user_id)),
    [assignments]
  )

  const staged = useMemo(() => {
    const q = stagingQuery.toLowerCase()
    return profiles.filter(p =>
      !assignedUserIds.has(p.id) &&
      (!q || p.full_name.toLowerCase().includes(q) || (p.default_agency ?? '').toLowerCase().includes(q))
    )
  }, [profiles, assignedUserIds, stagingQuery])

  const sysTeamIdMap = useMemo(() => {
    const m: Record<string, string> = {}
    teams.forEach((t: any) => { if (t.name.startsWith('__')) m[t.name] = t.id })
    return m
  }, [teams])

  const assignmentsByTeamId = useMemo(() => {
    const m: Record<string, any[]> = {}
    assignments.forEach((a: any) => {
      if (!m[a.team_id]) m[a.team_id] = []
      m[a.team_id].push(a)
    })
    return m
  }, [assignments])

  const opsTeams         = useMemo(() => teams.filter((t: any) => !t.name.startsWith('__')), [teams])
  const branches         = useMemo(() => divisions.filter((d: any) => d.type === 'branch'), [divisions])
  const divs             = useMemo(() => divisions.filter((d: any) => d.type === 'division'), [divisions])
  const unassignedGroups = useMemo(() => groups.filter((g: any) => !g.division_id), [groups])

  // Profile-based agency reps: assignments flagged is_agency_rep (or legacy position check)
  const agencyRepAssignments = useMemo(() => {
    const cmdId = sysTeamIdMap['__command__']
    if (!cmdId) return []
    return (assignmentsByTeamId[cmdId] ?? []).filter(
      (a: any) => a.is_agency_rep || a.ics_position === 'agency_representative'
    )
  }, [sysTeamIdMap, assignmentsByTeamId])

  // Derive the ICS section name from a team id — used when writing assignments
  // so the section column is always populated correctly.
  function sectionForTeam(teamId: string): string {
    const t = teams.find((x: any) => x.id === teamId)
    if (!t) return 'operations'
    if (t.name === '__command__')   return 'command'
    if (t.name === '__planning__')  return 'planning'
    if (t.name === '__logistics__') return 'logistics'
    if (t.name === '__finance__')   return 'finance'
    return 'operations'
  }

  const isDragging = !!(draggingProfileId || draggingAssignmentId)

  const caPositions = useMemo(() => {
    switch (caSection) {
      case 'command':    return COMMAND_STAFF_POSITIONS
      case 'operations': return OPERATIONS_POSITIONS
      case 'planning':   return PLANNING_POSITIONS
      case 'logistics':  return LOGISTICS_POSITIONS
      case 'finance':    return FINANCE_POSITIONS
      default:           return []
    }
  }, [caSection])

  // ── Toast ────────────────────────────────────────────────────────
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── System team helper ───────────────────────────────────────────
  async function ensureSysTeam(name: string, groupId: string | null, divisionId: string | null): Promise<string | null> {
    if (sysTeamIdMap[name]) return sysTeamIdMap[name]
    const supabase = createClient()
    const { data } = await supabase.from('teams').insert({
      operational_period_id: opId, group_id: groupId, division_id: divisionId, name,
    }).select().single()
    if (data) { setTeams(prev => [...prev, data]); return data.id }
    return null
  }

  // ── Structure creation ───────────────────────────────────────────
  async function createGroup(name: string) {
    if (!name.trim()) return
    const supabase = createClient()
    const { data, error } = await supabase.from('groups').insert({
      operational_period_id: opId, name: name.trim(),
    }).select().single()
    if (error) { showToast(error.message, false); return }
    setGroups(prev => [...prev, data])
    setAddingGroupName(''); setShowAddGroup(false)
    showToast(`Group "${data.name}" created`, true)
  }

  async function createTeam(name: string, groupId: string) {
    if (!name.trim()) return
    const supabase = createClient()
    const { data, error } = await supabase.from('teams').insert({
      operational_period_id: opId, group_id: groupId, name: name.trim(),
    }).select().single()
    if (error) { showToast(error.message, false); return }
    setTeams(prev => [...prev, data])
    setAddingTeamName(''); setAddingTeamToGroup(null)
    showToast(`Team "${data.name}" created`, true)
  }

  async function createUnit(name: string, type: 'division' | 'branch') {
    if (!name.trim()) return
    const supabase = createClient()
    const { data, error } = await supabase.from('divisions').insert({
      operational_period_id: opId, name: name.trim(), type,
    }).select().single()
    if (error) { showToast(error.message, false); return }
    setDivisions(prev => [...prev, data])
    setAddingUnitName(''); setShowAddUnit(null)
    showToast(`${type === 'branch' ? 'Branch' : 'Division'} "${data.name}" created`, true)
  }

  async function addAgencyRep(name: string, agency: string) {
    if (!name.trim()) return
    const supabase = createClient()
    const { data, error } = await supabase.from('agency_reps').insert({
      operational_period_id: opId,
      name: name.trim(),
      agency: agency.trim() || null,
    }).select().single()
    if (error) { showToast(error.message, false); return }
    setAgencyReps(prev => [...prev, data])
    setAddingRepName(''); setAddingRepAgency(''); setShowAddRep(false)
    showToast(`${data.name} added as Agency Rep`, true)
  }

  async function removeAgencyRep(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('agency_reps').delete().eq('id', id)
    if (error) { showToast(error.message, false); return }
    setAgencyReps(prev => prev.filter(r => r.id !== id))
  }

  async function moveGroupToDiv(groupId: string, divisionId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('groups').update({ division_id: divisionId }).eq('id', groupId)
    if (error) { showToast(error.message, false); return }
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, division_id: divisionId } : g))
    showToast('Group moved', true)
  }

  // ── Assignment write / reassign / remove ─────────────────────────
  async function createAssignment(profileId: string, teamId: string, position: string): Promise<boolean> {
    const p = profileMap[profileId]
    if (!p) return false
    if (assignedUserIds.has(profileId)) {
      showToast(`${p.full_name} is already assigned.`, false); return false
    }
    if (UNIQUE_POSITIONS.has(position)) {
      const conflict = (assignmentsByTeamId[teamId] ?? []).find((a: any) => a.ics_position === position)
      if (conflict) {
        showToast(`${profileMap[conflict.user_id]?.full_name ?? 'Someone'} already holds ${getPositionLabel(position)}.`, false)
        return false
      }
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const teamRow = teams.find((t: any) => t.id === teamId)
    const payload = {
      operational_period_id: opId,
      team_id:    teamId,
      user_id:    profileId,
      ics_position: position,
      home_agency: p.default_agency ?? '',
      home_unit:   p.default_unit ?? null,
      assigned_by: user!.id,
      dual_hatted: false,
      // Explicit model columns — backfilled on existing rows by migration
      section:      sectionForTeam(teamId),
      is_agency_rep: position === 'agency_representative',
      group_id:    teamRow?.group_id    ?? null,
      division_id: teamRow?.division_id ?? null,
    }
    console.log('[DnD] createAssignment payload', payload)
    const { data, error } = await supabase.from('assignments').insert(payload).select().single()
    setSaving(false)
    console.log('[DnD] createAssignment result', { data, error })
    if (error) { showToast(error.message, false); return false }
    setAssignments(prev => [...prev, data])
    showToast(`${p.full_name} → ${getPositionLabel(position)}`, true)
    return true
  }

  async function reassignTo(assignmentId: string, newTeamId: string, newPosition: string): Promise<boolean> {
    const assignment = assignments.find((a: any) => a.id === assignmentId)
    if (!assignment) return false
    if (assignment.team_id === newTeamId && assignment.ics_position === newPosition) return true
    if (UNIQUE_POSITIONS.has(newPosition)) {
      const conflict = (assignmentsByTeamId[newTeamId] ?? []).find(
        (a: any) => a.ics_position === newPosition && a.id !== assignmentId
      )
      if (conflict) {
        showToast(`${profileMap[conflict.user_id]?.full_name ?? 'Someone'} already holds ${getPositionLabel(newPosition)}.`, false)
        return false
      }
    }
    const teamRow = teams.find((t: any) => t.id === newTeamId)
    const newSection     = sectionForTeam(newTeamId)
    const newIsAgencyRep = newPosition === 'agency_representative'
    const newGroupId     = teamRow?.group_id    ?? null
    const newDivisionId  = teamRow?.division_id ?? null

    setSaving(true)
    const supabase = createClient()
    console.log('[DnD] reassignTo', { assignmentId, newTeamId, newPosition, newSection })
    const { error } = await supabase.from('assignments')
      .update({
        team_id:      newTeamId,
        ics_position: newPosition,
        section:      newSection,
        is_agency_rep: newIsAgencyRep,
        group_id:     newGroupId,
        division_id:  newDivisionId,
      })
      .eq('id', assignmentId)
    setSaving(false)
    console.log('[DnD] reassignTo result', { error })
    if (error) { showToast(error.message, false); return false }
    const p = profileMap[assignment.user_id]
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId ? {
        ...a,
        team_id:      newTeamId,
        ics_position: newPosition,
        section:      newSection,
        is_agency_rep: newIsAgencyRep,
        group_id:     newGroupId,
        division_id:  newDivisionId,
      } : a
    ))
    showToast(`${p?.full_name ?? 'Person'} → ${getPositionLabel(newPosition)}`, true)
    return true
  }

  async function removeAssignment(assignmentId: string) {
    const assignment = assignments.find((a: any) => a.id === assignmentId)
    if (!assignment) return
    const p = profileMap[assignment.user_id]
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
    setSaving(false)
    if (error) { showToast(error.message, false); return }
    setAssignments(prev => prev.filter(a => a.id !== assignmentId))
    showToast(`${p?.full_name ?? 'Person'} returned to staging`, true)
  }

  // ── DnD helpers ──────────────────────────────────────────────────
  // Creates an invisible DOM-attached element as the drag image.
  // setDragImage REQUIRES the element to be in the DOM — passing an off-DOM
  // element (e.g. a detached canvas) causes browsers to silently cancel the
  // drag and skip firing the drop event on the target.
  function attachGhost(): HTMLDivElement {
    const ghost = document.createElement('div')
    ghost.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(ghost)
    dragGhostRef.current = ghost
    return ghost
  }

  function dragStartProfile(profileId: string, e: React.DragEvent) {
    // dataTransfer MUST be written synchronously — browser clears it after handler yields.
    // setDragImage MUST be called synchronously too.
    // All React state updates are deferred to requestAnimationFrame so the browser can
    // fully register the drag before React re-renders. If setState is called synchronously
    // here, React immediately re-renders, which recreates nested sub-components (FilledSlot,
    // EmptySlot, TeamBlock…) as new function types, unmounting their DOM nodes. This
    // destroys the drop-target elements before the drop event fires, silently cancelling
    // any drag that originates from a nested component (i.e. all FilledSlot drags).
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('profile-id', profileId)
    e.dataTransfer.setDragImage(attachGhost(), 0, 0)
    const p = profileMap[profileId]
    console.log('[DnD] dragStartProfile', profileId, p?.full_name)
    requestAnimationFrame(() => {
      setDraggingProfileId(profileId)
      setDragOverlayData({ name: p?.full_name ?? '?', sub: p?.default_agency ?? p?.role ?? '' })
    })
  }

  function dragStartAssignment(assignmentId: string, e: React.DragEvent) {
    // Same rationale as dragStartProfile — defer state updates to rAF.
    // This is the primary fix for FilledSlot cards being undraggable after first placement:
    // the synchronous setState was causing React to unmount the dragged element mid-drag.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('assignment-id', assignmentId)
    e.dataTransfer.setDragImage(attachGhost(), 0, 0)
    const a = assignments.find((x: any) => x.id === assignmentId)
    const p = a ? profileMap[a.user_id] : null
    console.log('[DnD] dragStartAssignment', assignmentId, p?.full_name)
    requestAnimationFrame(() => {
      setDraggingAssignmentId(assignmentId)
      setDragOverlayData({ name: p?.full_name ?? '?', sub: getPositionLabel(a?.ics_position ?? '') })
    })
  }

  function dragEnd() {
    setDraggingProfileId(null); setDraggingAssignmentId(null)
    setDraggingGroupId(null); setDragOverKey(null); setDragOverDivId(null)
    setDragOverlayData(null)
    if (dragGhostRef.current) {
      try { document.body.removeChild(dragGhostRef.current) } catch {}
      dragGhostRef.current = null
    }
  }

  function dragOverProps(key: string) {
    return {
      onDragOver:  (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key) },
      onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) },
    }
  }

  // Unified drop: handles both profile→slot and assignment→slot.
  // dataTransfer data MUST be read synchronously before any await — the browser
  // clears it after the event handler yields. dragEnd() is called synchronously
  // too so drag state is never left set if the source element is removed from
  // the DOM (which prevents onDragEnd from firing on the source).
  async function performDrop(e: React.DragEvent, teamId: string, position: string) {
    e.preventDefault()
    const aid = e.dataTransfer.getData('assignment-id')
    const pid = e.dataTransfer.getData('profile-id')
    console.log('[DnD] performDrop', { teamId, position, aid, pid })
    dragEnd()
    if (aid) { await reassignTo(aid, teamId, position); return }
    if (pid) await createAssignment(pid, teamId, position)
  }

  async function performDropSys(e: React.DragEvent, sysKey: string, position: string, groupId: string | null, divId: string | null) {
    e.preventDefault()
    const aid = e.dataTransfer.getData('assignment-id')
    const pid = e.dataTransfer.getData('profile-id')
    console.log('[DnD] performDropSys', { sysKey, position, groupId, divId, aid, pid })
    dragEnd()
    if (aid) {
      const tid = await ensureSysTeam(sysKey, groupId, divId)
      if (tid) await reassignTo(aid, tid, position)
      return
    }
    if (!pid) return
    const tid = await ensureSysTeam(sysKey, groupId, divId)
    if (tid) await createAssignment(pid, tid, position)
  }

  async function performDropToStaging(e: React.DragEvent) {
    e.preventDefault()
    const aid = e.dataTransfer.getData('assignment-id')
    console.log('[DnD] performDropToStaging', { aid })
    dragEnd()
    if (aid) await removeAssignment(aid)
  }

  // ── Click-to-assign ───────────────────────────────────────────────
  function openAssign(p: any) {
    setAssigningProfile(p)
    setMovingAssignmentId(null)
    setCaSection('command'); setCaTeamId(''); setCaPosition(''); setCaError(null)
    setMobileStagingOpen(false)
  }

  async function performClickAssign() {
    if (!assigningProfile || !caPosition) { setCaError('Select a position'); return }
    if (caSection === 'operations' && !caTeamId) { setCaError('Select a team'); return }
    setCaSaving(true); setCaError(null)
    let teamId: string
    if (caSection === 'operations') {
      teamId = caTeamId
    } else {
      const sysKeyMap: Record<string, string> = {
        command: '__command__', planning: '__planning__',
        logistics: '__logistics__', finance: '__finance__',
      }
      const id = await ensureSysTeam(sysKeyMap[caSection], null, null)
      if (!id) { setCaError('Failed to resolve section team'); setCaSaving(false); return }
      teamId = id
    }
    // Move mode (mobile reassign): call reassignTo instead of createAssignment
    const ok = movingAssignmentId
      ? await reassignTo(movingAssignmentId, teamId, caPosition)
      : await createAssignment(assigningProfile.id, teamId, caPosition)
    setCaSaving(false)
    if (ok) { setAssigningProfile(null); setMovingAssignmentId(null) }
    else setCaError('Assignment failed — see notification')
  }

  // ── InlineAdd ────────────────────────────────────────────────────
  function InlineAdd({ placeholder, value, onChange, onSubmit, onCancel, label }: {
    placeholder: string; value: string; onChange: (v: string) => void
    onSubmit: () => void; onCancel: () => void; label: string
  }) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input
          autoFocus
          type="text"
          className="flex-1 bg-[#121821] border border-[#FF5A1F]/40 text-[#E5E7EB] placeholder-[#374151] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF5A1F]"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel() }}
        />
        <button onClick={onSubmit}
          className="text-xs bg-[#FF5A1F] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#FF6A33] transition-colors flex-shrink-0">
          {label}
        </button>
        <button onClick={onCancel}
          className="text-xs text-[#6B7280] hover:text-[#E5E7EB] px-2 py-1.5 transition-colors flex-shrink-0">
          ✕
        </button>
      </div>
    )
  }

  // ── Sub-components ───────────────────────────────────────────────

  function EmptySlot({ label, dropKey, onDrop, onClickAssign }: {
    label: string; dropKey: string; onDrop: (e: React.DragEvent) => void; onClickAssign: () => void
  }) {
    const isOver = dragOverKey === dropKey
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed transition-colors ${
          isOver ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 shadow-[0_0_0_1px_rgba(255,90,31,0.25)]' : isDragging ? 'border-[#3a4555] bg-[#0d1520]' : 'border-[#1f2937]'
        }`}
        {...dragOverProps(dropKey)}
        onDrop={onDrop}
      >
        <div className="w-6 h-6 rounded-full bg-[#1a2235] border border-dashed border-[#232B36] flex items-center justify-center flex-shrink-0">
          <span className={`text-xs ${isOver ? 'text-[#FF5A1F]' : 'text-[#374151]'}`}>{isOver ? '↓' : '+'}</span>
        </div>
        <span className={`text-xs flex-1 ${isOver ? 'text-[#FF5A1F]' : 'text-[#374151]'}`}>
          {isOver ? `Drop to assign as ${label}` : label}
        </span>
        {!isDragging && (
          <button onClick={onClickAssign}
            className="text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-[#FF5A1F]/10">
            Assign
          </button>
        )}
      </div>
    )
  }

  function FilledSlot({ label, assignment }: { label: string; assignment: any }) {
    const p = profileMap[assignment.user_id]
    const isBeingDragged = draggingAssignmentId === assignment.id
    const status = activityStatus(assignment.user_id, lastEntryMap)
    const last   = lastEntryMap[assignment.user_id]
    return (
      <div
        draggable
        onDragStart={e => dragStartAssignment(assignment.id, e)}
        onDragEnd={dragEnd}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-grab active:cursor-grabbing select-none ${
          isBeingDragged
            ? 'opacity-60 border-[#FF5A1F]/40 bg-[#FF5A1F]/5'
            : 'bg-[#121821] border-[#232B36] hover:border-[#3a4555]'
        }`}
      >
        <div className="w-6 h-6 rounded-full bg-[#1a2235] border border-[#232B36] flex items-center justify-center text-[10px] font-mono text-[#9CA3AF] flex-shrink-0">
          {getInitials(p?.full_name ?? '?')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#E5E7EB] truncate">{p?.full_name ?? 'Unknown'}</p>
          <p className="text-[10px] text-[#4B5563] leading-none mt-px">{label}</p>
        </div>
        {assignment.dual_hatted && (
          <span className="text-[9px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-1 py-px rounded font-mono flex-shrink-0">DH</span>
        )}
        {/* Activity status dot + last-entry time */}
        <div className="flex-shrink-0 flex flex-col items-center gap-px" title={last ? `Last log: ${fmtAgo(last)}` : 'No log yet'}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT_COLOR[status] }} />
          {last && <p className="text-[9px] text-[#374151] leading-none tabular-nums">{fmtAgo(last)}</p>}
        </div>
        {/* Mobile: tap to open action sheet */}
        <button
          onClick={e => { e.stopPropagation(); setMobileActionSheet({ assignment, profile: p }) }}
          className="md:hidden text-[#6B7280] w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#232B36] flex-shrink-0 touch-manipulation text-base leading-none"
          title="Actions"
        >⋮</button>
        {/* Desktop: × to remove directly */}
        <button
          onClick={e => { e.stopPropagation(); removeAssignment(assignment.id) }}
          className="hidden md:flex text-[#374151] hover:text-red-400 transition-colors text-sm w-5 h-5 items-center justify-center rounded hover:bg-red-500/10 flex-shrink-0"
          title="Return to staging"
        >×</button>
      </div>
    )
  }

  function TeamBlock({ team, indent = false }: { team: any; indent?: boolean }) {
    const leaderAssignment = (assignmentsByTeamId[team.id] ?? []).find((a: any) => a.ics_position === 'team_leader') ?? null
    const members = (assignmentsByTeamId[team.id] ?? []).filter((a: any) => a.ics_position !== 'team_leader')
    const memberDropKey = `member:${team.id}`
    const memberIsOver  = dragOverKey === memberDropKey
    return (
      <div className={`rounded-lg border border-[#232B36] overflow-hidden ${indent ? 'ml-4' : ''}`}>
        <div className="px-3 py-1.5 bg-[#1a2235]/60 flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#4B5563] uppercase">Team</span>
          <span className="text-xs font-semibold text-[#9CA3AF] flex-1">{team.name}</span>
          <span className="text-[10px] font-mono text-[#374151]">{members.length}m</span>
        </div>
        <div className="px-3 py-2 space-y-1.5 bg-[#0f1419]/40">
          {leaderAssignment
            ? <FilledSlot label="Team Leader" assignment={leaderAssignment} />
            : <EmptySlot
                label="Team Leader"
                dropKey={`leader:${team.id}`}
                onDrop={e => performDrop(e, team.id, 'team_leader')}
                onClickAssign={() => { openAssign(null); setCaSection('operations'); setCaTeamId(team.id); setCaPosition('team_leader') }}
              />
          }
          {members.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-[#1f2937]/60">
              {members.map((m: any) => <FilledSlot key={m.id} label={getPositionLabel(m.ics_position)} assignment={m} />)}
            </div>
          )}
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded border border-dashed transition-colors mt-1 ${
              memberIsOver ? 'border-[#38BDF8] bg-[#38BDF8]/10 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]' : isDragging ? 'border-[#2a3545]' : 'border-[#1a2235]'
            }`}
            {...dragOverProps(memberDropKey)}
            onDrop={e => performDrop(e, team.id, 'team_member')}
          >
            <span className={`text-[10px] flex-1 font-mono ${memberIsOver ? 'text-[#38BDF8]' : 'text-[#1f2937]'}`}>
              {memberIsOver ? '↓ Drop to add member' : '+ members'}
            </span>
            {!isDragging && (
              <button
                onClick={() => { openAssign(null); setCaSection('operations'); setCaTeamId(team.id); setCaPosition('') }}
                className="text-[10px] text-[#374151] hover:text-[#38BDF8] transition-colors font-mono">
                Add
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function GroupBlock({ group, indent = false }: { group: any; indent?: boolean }) {
    const sysKey = `__gr_${group.id}__`
    const sysTeamId = sysTeamIdMap[sysKey]
    const supervisorAssignment = sysTeamId ? (assignmentsByTeamId[sysTeamId] ?? [])[0] ?? null : null
    const groupTeams  = opsTeams.filter((t: any) => t.group_id === group.id)
    const isAddingTeam = addingTeamToGroup === group.id
    return (
      <div className={`rounded-xl border border-[#232B36] overflow-hidden ${indent ? 'ml-4' : ''}`}>
        <div className="px-3 py-2 bg-[#161D26] flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider">Group</span>
          <span className="text-sm font-semibold text-[#E5E7EB] flex-1">{group.name}</span>
          <button
            onClick={() => { setAddingTeamToGroup(isAddingTeam ? null : group.id); setAddingTeamName('') }}
            className="text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-[#FF5A1F]/10">
            + Team
          </button>
        </div>
        <div className="px-3 py-2 space-y-2 bg-[#0f1419]/40">
          {supervisorAssignment
            ? <FilledSlot label="Group Supervisor" assignment={supervisorAssignment} />
            : <EmptySlot
                label="Group Supervisor"
                dropKey={`grpsup:${group.id}`}
                onDrop={e => performDropSys(e, sysKey, 'group_supervisor', group.id, group.division_id ?? null)}
                onClickAssign={() => { openAssign(null); setCaSection('operations') }}
              />
          }
          {groupTeams.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {groupTeams.map((t: any) => <TeamBlock key={t.id} team={t} indent />)}
            </div>
          )}
          {isAddingTeam && (
            <InlineAdd
              placeholder="Team name…"
              value={addingTeamName}
              onChange={setAddingTeamName}
              onSubmit={() => createTeam(addingTeamName, group.id)}
              onCancel={() => setAddingTeamToGroup(null)}
              label="Add"
            />
          )}
        </div>
      </div>
    )
  }

  function UnitBlock({ unit }: { unit: any }) {
    const isBranch = unit.type === 'branch'
    const sysKey   = isBranch ? `__br_${unit.id}__` : `__dv_${unit.id}__`
    const sysTeamId = sysTeamIdMap[sysKey]
    const leaderAssignment = sysTeamId ? (assignmentsByTeamId[sysTeamId] ?? [])[0] ?? null : null
    const leaderRole  = isBranch ? 'branch_director' : 'division_supervisor'
    const leaderLabel = isBranch ? 'Branch Director' : 'Division Supervisor'
    const childGroups = groups.filter((g: any) => g.division_id === unit.id)
    const directTeams = opsTeams.filter((t: any) => t.division_id === unit.id && !t.group_id)
    const isGroupOver = dragOverDivId === unit.id
    return (
      <div
        className={`rounded-xl border overflow-hidden transition-all ${
          isBranch ? 'border-orange-900/40' : 'border-sky-900/40'
        } ${isGroupOver ? 'ring-1 ring-[#FF5A1F]/50' : ''}`}
        onDragOver={e => { e.preventDefault(); if (draggingGroupId) setDragOverDivId(unit.id) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDivId(null) }}
        onDrop={async e => {
          e.preventDefault()
          const gid = e.dataTransfer.getData('group-id')
          dragEnd()
          if (gid) await moveGroupToDiv(gid, unit.id)
        }}
      >
        <div className={`px-4 py-2.5 flex items-center gap-2 ${isBranch ? 'bg-orange-950/40' : 'bg-sky-950/40'}`}>
          <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${isBranch ? 'text-orange-400' : 'text-sky-400'}`}>
            {isBranch ? 'Branch' : 'Division'}
          </span>
          <span className="text-sm font-bold text-[#E5E7EB] flex-1">{unit.name}</span>
          {isGroupOver && <span className="text-[10px] text-[#FF5A1F] font-mono animate-pulse">Drop group here</span>}
        </div>
        <div className="px-4 py-3 space-y-2.5 bg-[#0f1419]/30">
          {leaderAssignment
            ? <FilledSlot label={leaderLabel} assignment={leaderAssignment} />
            : <EmptySlot
                label={leaderLabel}
                dropKey={`unit-leader:${unit.id}`}
                onDrop={e => performDropSys(e, sysKey, leaderRole, null, unit.id)}
                onClickAssign={() => { openAssign(null); setCaSection('operations') }}
              />
          }
          {childGroups.map((g: any) => <GroupBlock key={g.id} group={g} indent />)}
          {directTeams.map((t: any) => <TeamBlock key={t.id} team={t} indent />)}
          {isGroupOver && childGroups.length === 0 && (
            <div className="border border-dashed border-[#FF5A1F]/40 rounded-lg py-3 text-center text-[10px] text-[#FF5A1F] font-mono">
              ↓ Drop group here
            </div>
          )}
        </div>
      </div>
    )
  }

  function StaffSection({ label, sysKey, positions, color }: {
    label: string; sysKey: string; positions: typeof PLANNING_POSITIONS; color: string
  }) {
    const sysTeamId  = sysTeamIdMap[sysKey]
    const members    = sysTeamId ? (assignmentsByTeamId[sysTeamId] ?? []) : []
    const dropKey    = `staffsec:${sysKey}`
    const isOver     = dragOverKey === dropKey
    return (
      <div className="rounded-xl border border-[#232B36] overflow-hidden">
        <div className="px-4 py-2.5 bg-[#161D26] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">{label}</span>
          <span className="text-[10px] font-mono text-[#374151] ml-auto">{members.length} assigned</span>
        </div>
        <div className="px-4 py-3 space-y-1.5 bg-[#0f1419]/30">
          {members.map((a: any) => <FilledSlot key={a.id} label={getPositionLabel(a.ics_position)} assignment={a} />)}
          <div
            className={`flex items-center gap-2 px-2 py-2 rounded border border-dashed transition-colors ${
              isOver ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 shadow-[0_0_0_1px_rgba(255,90,31,0.25)]' : isDragging ? 'border-[#2a3545]' : 'border-[#1a2235]'
            }`}
            {...dragOverProps(dropKey)}
            onDrop={async e => {
              e.preventDefault()
              const aid = e.dataTransfer.getData('assignment-id')
              const pid = e.dataTransfer.getData('profile-id')
              dragEnd()
              const chief = positions[0]?.value ?? ''
              if (!chief) return
              const tid = await ensureSysTeam(sysKey, null, null)
              if (!tid) return
              if (aid) { await reassignTo(aid, tid, chief); return }
              if (pid) await createAssignment(pid, tid, chief)
            }}
          >
            <span className={`text-[10px] flex-1 font-mono ${isOver ? 'text-[#FF5A1F]' : 'text-[#1f2937]'}`}>
              {isOver ? '↓ Drop to add' : '+ add personnel'}
            </span>
            {!isDragging && (
              <button
                onClick={() => {
                  setAssigningProfile({ id: '__section__', full_name: '' })
                  const secKey = sysKey.replace(/__/g, '')
                  const map: Record<string, string> = { planning: 'planning', logistics: 'logistics', finance: 'finance' }
                  setCaSection(map[secKey] ?? 'planning')
                  setCaTeamId(sysTeamId ?? ''); setCaPosition(''); setCaError(null)
                }}
                className="text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono">
                Assign
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  const cmdTeamId      = sysTeamIdMap['__command__']
  const cmdAssignments = cmdTeamId ? (assignmentsByTeamId[cmdTeamId] ?? []) : []
  const hasOpsStructure = branches.length > 0 || divs.length > 0 || unassignedGroups.length > 0
  const hasDivUnits     = branches.length > 0 || divs.length > 0

  // ── Staging panel ─────────────────────────────────────────────────
  const stagingDropKey = 'staging-pool'
  const stagingIsOver  = dragOverKey === stagingDropKey

  const StagingContent = (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-[#232B36]/60">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-xs font-bold text-[#E5E7EB] uppercase tracking-wider">Staging</span>
          <span className="text-[10px] font-mono text-[#FF5A1F] bg-[#FF5A1F]/10 px-1.5 py-px rounded">{staged.length}</span>
        </div>
        <div className="relative">
          <input
            type="text"
            className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] placeholder-[#374151] rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#FF5A1F]/50"
            placeholder="Search name or agency…"
            value={stagingQuery}
            onChange={e => setStagingQuery(e.target.value)}
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#374151]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
        {draggingAssignmentId && (
          <p className="text-[10px] text-[#FF5A1F] font-mono mt-1.5 text-center animate-pulse">Drop here to unassign</p>
        )}
      </div>

      {/* Drop zone for returning assigned people */}
      <div
        className={`flex-1 overflow-y-auto p-2 space-y-1 transition-colors ${
          stagingIsOver ? 'bg-[#FF5A1F]/5 ring-1 ring-inset ring-[#FF5A1F]/30 rounded-b-xl' : ''
        }`}
        onDragOver={e => { e.preventDefault(); if (draggingAssignmentId) { e.dataTransfer.dropEffect = 'move'; setDragOverKey(stagingDropKey) } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) }}
        onDrop={performDropToStaging}
      >
        {stagingIsOver && (
          <div className="border border-dashed border-[#FF5A1F]/60 rounded-lg py-3 mb-2 text-center">
            <p className="text-[10px] text-[#FF5A1F] font-mono">↓ Return to staging</p>
          </div>
        )}
        {staged.length === 0 && !stagingIsOver && (
          <p className="text-[10px] text-[#374151] text-center py-6 font-mono">
            {stagingQuery ? 'No match' : 'All personnel assigned'}
          </p>
        )}
        {staged.map((p: any) => {
          const stagStatus = activityStatus(p.id, lastEntryMap)
          const stagLast   = lastEntryMap[p.id]
          return (
          <div
            key={p.id}
            draggable
            onDragStart={e => dragStartProfile(p.id, e)}
            onDragEnd={dragEnd}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors select-none ${
              draggingProfileId === p.id
                ? 'opacity-60 border-[#FF5A1F]/40 bg-[#FF5A1F]/5'
                : 'border-[#232B36] bg-[#121821] hover:border-[#3a4555] hover:bg-[#161D26]'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-[#1a2235] border border-[#232B36] flex items-center justify-center text-[10px] font-mono text-[#9CA3AF] flex-shrink-0">
              {getInitials(p.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#E5E7EB] truncate">{p.full_name}</p>
              <p className="text-[10px] text-[#4B5563] truncate leading-none mt-px">
                {stagLast ? fmtAgo(stagLast) : (p.default_agency ?? p.role ?? '—')}
              </p>
            </div>
            {/* Status dot — always shown so staging users are accounted for */}
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: STATUS_DOT_COLOR[stagStatus] }}
              title={stagLast ? `Last log: ${fmtAgo(stagLast)}` : 'No log yet'}
            />
            <button
              onClick={() => openAssign(p)}
              className="flex-shrink-0 text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono touch-manipulation rounded px-2 py-1.5 hover:bg-[#FF5A1F]/10"
              title="Assign"
            >
              <span className="md:hidden text-xs font-medium">Assign</span>
              <span className="hidden md:inline">→</span>
            </button>
          </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">

      {/* Header */}
      <header className="sticky top-12 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        <div className="px-4 h-11 flex items-center gap-3 max-w-5xl mx-auto">
          <Link href={`/events/${eventId}`}
            className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex-shrink-0">
            ← Event
          </Link>
          <div className="w-px h-4 bg-[#232B36]" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-[#E5E7EB]">Staff — OP {op?.period_number}</span>
            <span className="text-[10px] text-[#4B5563] ml-2 font-mono">Command OS</span>
          </div>
          <button
            className="md:hidden flex items-center gap-1.5 text-xs text-[#FF5A1F] bg-[#FF5A1F]/10 px-2.5 py-1.5 rounded-lg font-medium"
            onClick={() => setMobileStagingOpen(v => !v)}
          >
            Staging
            <span className="text-[10px] font-mono bg-[#FF5A1F] text-white px-1 rounded">{staged.length}</span>
          </button>
        </div>
      </header>

      {/* Mobile staging drawer */}
      {mobileStagingOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/70" onClick={() => setMobileStagingOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 bg-[#161D26] border-t border-[#232B36] rounded-t-2xl max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#232B36]">
              <span className="text-sm font-semibold text-[#E5E7EB]">Staging Pool</span>
              <button onClick={() => setMobileStagingOpen(false)} className="text-[#6B7280] hover:text-[#E5E7EB] text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">{StagingContent}</div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 max-w-5xl mx-auto w-full">

        {/* Staging sidebar — desktop */}
        <aside className="hidden md:flex flex-col w-60 border-r border-[#232B36]/60 sticky top-[92px] h-[calc(100vh-92px)]">
          {StagingContent}
        </aside>

        {/* Org canvas */}
        <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-24">

          {saving && (
            <div className="text-[10px] text-[#FF5A1F] font-mono text-center animate-pulse">Saving…</div>
          )}

          {/* Command */}
          <div className="rounded-xl border border-[#232B36] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#161D26] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] flex-shrink-0" />
              <span className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Command</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#0f1419]/30">
              {COMMAND_SLOTS.map(slot => {
                const filled = cmdAssignments.find((a: any) => a.ics_position === slot.position)
                return filled
                  ? <FilledSlot key={slot.position} label={slot.label} assignment={filled} />
                  : <EmptySlot
                      key={slot.position}
                      label={slot.label}
                      dropKey={`cmd:${slot.position}`}
                      onDrop={async e => {
                        e.preventDefault()
                        const aid = e.dataTransfer.getData('assignment-id')
                        const pid = e.dataTransfer.getData('profile-id')
                        dragEnd()
                        const tid = await ensureSysTeam('__command__', null, null)
                        if (!tid) return
                        if (aid) { await reassignTo(aid, tid, slot.position); return }
                        if (pid) await createAssignment(pid, tid, slot.position)
                      }}
                      onClickAssign={() => {
                        setAssigningProfile({ id: '__cmd__', full_name: '' })
                        setCaSection('command'); setCaTeamId(cmdTeamId ?? ''); setCaPosition(slot.position); setCaError(null)
                      }}
                    />
              })}
            </div>

            {/* Agency Representatives */}
            {(() => {
              const repDropKey = 'agency-reps-drop'
              const repIsOver  = dragOverKey === repDropKey
              const totalReps  = agencyRepAssignments.length + agencyReps.length
              return (
                <div className="px-4 py-3 border-t border-[#232B36]/50 bg-[#0a0e14]/40">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                      Agency Representatives
                    </span>
                    {totalReps > 0 && (
                      <span className="text-[10px] font-mono text-[#374151]">{totalReps}</span>
                    )}
                  </div>

                  {/* Profile-based reps dragged from staging */}
                  {agencyRepAssignments.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {agencyRepAssignments.map((a: any) => {
                        const p = profileMap[a.user_id]
                        return (
                          <FilledSlot
                            key={a.id}
                            label={p?.default_agency ?? 'Agency Representative'}
                            assignment={a}
                          />
                        )
                      })}
                    </div>
                  )}

                  {/* Manual / external reps */}
                  {agencyReps.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {agencyReps.map((r: any) => (
                        <div key={r.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#121821] border border-[#232B36]">
                          <div className="w-6 h-6 rounded-full bg-[#1a2235] border border-[#232B36] flex items-center justify-center text-[10px] font-mono text-[#6B7280] flex-shrink-0 select-none">
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#E5E7EB] truncate">{r.name}</p>
                            {r.agency && (
                              <p className="text-[10px] text-[#4B5563] leading-none mt-px truncate">{r.agency}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeAgencyRep(r.id)}
                            className="text-[#374151] hover:text-red-400 transition-colors text-sm w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/10 flex-shrink-0"
                            title="Remove">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drop zone for staging drags */}
                  <div
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg border border-dashed transition-colors ${
                      repIsOver
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                        : isDragging
                        ? 'border-[#374151] bg-[#0f1419]'
                        : 'border-[#1a2235]'
                    }`}
                    onDragOver={e => { e.preventDefault(); if (draggingProfileId || draggingAssignmentId) { e.dataTransfer.dropEffect = 'move'; setDragOverKey(repDropKey) } }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) }}
                    onDrop={async e => {
                      e.preventDefault()
                      const aid = e.dataTransfer.getData('assignment-id')
                      const pid = e.dataTransfer.getData('profile-id')
                      dragEnd()
                      const tid = await ensureSysTeam('__command__', null, null)
                      if (!tid) return
                      if (aid) { await reassignTo(aid, tid, 'agency_representative'); return }
                      if (pid) await createAssignment(pid, tid, 'agency_representative')
                    }}
                  >
                    <span className={`text-[10px] flex-1 font-mono ${repIsOver ? 'text-[#FF5A1F]' : 'text-[#1f2937]'}`}>
                      {repIsOver ? '↓ Drop to add as Agency Rep' : '+ drag person here'}
                    </span>
                    {!isDragging && (
                      <button
                        onClick={() => { setShowAddRep(v => !v); setAddingRepName(''); setAddingRepAgency('') }}
                        className="text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-[#FF5A1F]/10 flex-shrink-0"
                      >
                        + Add manually
                      </button>
                    )}
                  </div>

                  {/* Manual add form */}
                  {showAddRep && (
                    <div className="mt-2 space-y-1.5">
                      <input
                        autoFocus
                        type="text"
                        className="w-full bg-[#121821] border border-[#FF5A1F]/30 text-[#E5E7EB] placeholder-[#374151] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF5A1F]/60"
                        placeholder="Name (e.g. John Smith)"
                        value={addingRepName}
                        onChange={e => setAddingRepName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addAgencyRep(addingRepName, addingRepAgency); if (e.key === 'Escape') setShowAddRep(false) }}
                      />
                      <input
                        type="text"
                        className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] placeholder-[#374151] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF5A1F]/40"
                        placeholder="Agency (e.g. DTE Energy)"
                        value={addingRepAgency}
                        onChange={e => setAddingRepAgency(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addAgencyRep(addingRepName, addingRepAgency); if (e.key === 'Escape') setShowAddRep(false) }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => addAgencyRep(addingRepName, addingRepAgency)}
                          disabled={!addingRepName.trim()}
                          className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-40 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors"
                        >
                          Add Rep
                        </button>
                        <button
                          onClick={() => setShowAddRep(false)}
                          className="px-3 bg-[#121821] border border-[#232B36] text-[#6B7280] hover:text-[#E5E7EB] rounded-lg py-1.5 text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Operations */}
          <div className="space-y-3">
            <div className="rounded-xl border border-[#232B36] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#161D26] flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#EF4444] flex-shrink-0" />
                <span className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest flex-1">Operations</span>
                {/* Group always first — most frequent */}
                <button
                  onClick={() => { setShowAddGroup(true); setAddingGroupName('') }}
                  className="text-[10px] font-medium text-[#9CA3AF] bg-[#1a2235] border border-[#2d3a4a] hover:border-[#FF5A1F]/50 hover:text-[#FF5A1F] px-2 py-1 rounded-md transition-colors"
                >
                  + Group
                </button>
                {hasOpsStructure && (
                  <>
                    <button
                      onClick={() => { setShowAddUnit('division'); setAddingUnitName('') }}
                      className="text-[10px] font-medium text-[#9CA3AF] bg-[#1a2235] border border-[#2d3a4a] hover:border-[#38BDF8]/50 hover:text-[#38BDF8] px-2 py-1 rounded-md transition-colors"
                    >
                      + Division
                    </button>
                    <button
                      onClick={() => { setShowAddUnit('branch'); setAddingUnitName('') }}
                      className="text-[10px] font-medium text-[#9CA3AF] bg-[#1a2235] border border-[#2d3a4a] hover:border-[#F97316]/50 hover:text-[#F97316] px-2 py-1 rounded-md transition-colors"
                    >
                      + Branch
                    </button>
                  </>
                )}
              </div>
            </div>

            {showAddUnit && (
              <InlineAdd
                placeholder={`${showAddUnit === 'branch' ? 'Branch' : 'Division'} name…`}
                value={addingUnitName}
                onChange={setAddingUnitName}
                onSubmit={() => createUnit(addingUnitName, showAddUnit)}
                onCancel={() => setShowAddUnit(null)}
                label="Create"
              />
            )}

            {showAddGroup && (
              <InlineAdd
                placeholder="Group name (e.g. Search Group)…"
                value={addingGroupName}
                onChange={setAddingGroupName}
                onSubmit={() => createGroup(addingGroupName)}
                onCancel={() => setShowAddGroup(false)}
                label="Create"
              />
            )}

            {/* Empty state */}
            {!hasOpsStructure && !showAddGroup && (
              <div className="rounded-xl border border-dashed border-[#232B36] py-8 px-4 text-center space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#9CA3AF]">No operations structure yet</p>
                  <p className="text-xs text-[#4B5563]">Start by creating a Group. Teams live inside Groups.</p>
                </div>
                <button
                  onClick={() => { setShowAddGroup(true); setAddingGroupName('') }}
                  className="inline-flex items-center gap-1.5 bg-[#FF5A1F] text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-[#FF6A33] transition-colors"
                >
                  <span className="text-base leading-none">+</span> Add Group
                </button>
                <p className="text-[10px] text-[#374151] font-mono">Divisions and Branches can be added after groups exist</p>
              </div>
            )}

            {branches.map((b: any) => <UnitBlock key={b.id} unit={b} />)}
            {divs.map((d: any) => <UnitBlock key={d.id} unit={d} />)}

            {unassignedGroups.map((g: any) => (
              <div
                key={g.id}
                draggable={hasDivUnits}
                onDragStart={e => {
                  if (!hasDivUnits) return
                  setDraggingGroupId(g.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('group-id', g.id)
                }}
                onDragEnd={dragEnd}
              >
                <GroupBlock group={g} />
              </div>
            ))}

            {hasDivUnits && unassignedGroups.length > 0 && (
              <p className="text-[10px] text-[#374151] font-mono px-1">
                Drag a group into a Branch or Division to nest it
              </p>
            )}
          </div>

          {/* Staff sections */}
          {SECTION_DEFS.map(sec => (
            <StaffSection
              key={sec.key}
              label={sec.label}
              sysKey={sec.sysKey}
              positions={sec.positions}
              color={
                sec.key === 'planning'  ? '#EAB308' :  // yellow
                sec.key === 'logistics' ? '#3B82F6' :  // blue
                                          '#22C55E'    // green (finance)
              }
            />
          ))}

        </main>
      </div>

      {/* Click-to-assign / Move modal */}
      {assigningProfile && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => { setAssigningProfile(null); setMovingAssignmentId(null) }}
        >
          <div className="bg-[#161D26] border border-[#232B36] rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">
                {movingAssignmentId ? 'Move to New Slot' : 'Assign from Staging'}
              </p>
              {assigningProfile.full_name && (
                <p className="text-base font-semibold text-[#E5E7EB] mt-0.5">{assigningProfile.full_name}</p>
              )}
            </div>

            {!assigningProfile.full_name && (
              <div>
                <p className="text-xs text-[#6B7280] mb-1.5">Person</p>
                <select
                  className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
                  value={['__cmd__','__section__'].includes(assigningProfile.id) ? '' : assigningProfile.id}
                  onChange={e => { const p = profiles.find((x: any) => x.id === e.target.value); if (p) setAssigningProfile(p) }}
                >
                  <option value="">Select person…</option>
                  {staged.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.default_agency ? ` (${p.default_agency})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="text-xs text-[#6B7280] mb-1.5">Section</p>
              <div className="grid grid-cols-3 gap-1.5">
                {['command','operations','planning','logistics','finance'].map(s => (
                  <button key={s}
                    onClick={() => { setCaSection(s); setCaTeamId(''); setCaPosition('') }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      caSection === s ? 'bg-[#FF5A1F] text-white' : 'bg-[#121821] border border-[#232B36] text-[#6B7280] hover:text-[#E5E7EB]'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {caSection === 'operations' && (
              <div>
                <p className="text-xs text-[#6B7280] mb-1.5">Team</p>
                <select
                  value={caTeamId}
                  onChange={e => { setCaTeamId(e.target.value); setCaPosition('') }}
                  className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
                >
                  <option value="">Select team…</option>
                  {opsTeams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <p className="text-xs text-[#6B7280] mb-1.5">Position</p>
              <select
                value={caPosition}
                onChange={e => setCaPosition(e.target.value)}
                className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
              >
                <option value="">Select position…</option>
                {caPositions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            {caError && <p className="text-xs text-red-400">{caError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={performClickAssign}
                disabled={caSaving || !caPosition || (caSection === 'operations' && !caTeamId)}
                className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
              >
                {caSaving ? (movingAssignmentId ? 'Moving…' : 'Assigning…') : (movingAssignmentId ? 'Move' : 'Assign')}
              </button>
              <button onClick={() => { setAssigningProfile(null); setMovingAssignmentId(null) }}
                className="px-4 bg-[#121821] border border-[#232B36] text-[#6B7280] hover:text-[#E5E7EB] rounded-xl py-2.5 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile action sheet — tap ⋮ on an assigned card */}
      {mobileActionSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end"
          onClick={() => setMobileActionSheet(null)}
        >
          <div
            className="w-full bg-[#161D26] border-t border-[#232B36] rounded-t-2xl px-4 pt-4 pb-8 space-y-2"
            onClick={e => e.stopPropagation()}
          >
            {/* Person header */}
            <div className="flex items-center gap-3 pb-3 border-b border-[#232B36]">
              <div className="w-9 h-9 rounded-full bg-[#1a2235] border border-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                {getInitials(mobileActionSheet.profile?.full_name ?? '?')}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#E5E7EB] truncate">
                  {mobileActionSheet.profile?.full_name ?? 'Unknown'}
                </p>
                <p className="text-xs text-[#6B7280] truncate">
                  {getPositionLabel(mobileActionSheet.assignment.ics_position)}
                </p>
              </div>
            </div>

            {/* Move to new slot */}
            <button
              onClick={() => {
                const { assignment, profile } = mobileActionSheet
                setMobileActionSheet(null)
                setMovingAssignmentId(assignment.id)
                setAssigningProfile(profile)
                setCaSection('command'); setCaTeamId(''); setCaPosition(''); setCaError(null)
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#121821] border border-[#232B36] text-sm text-[#E5E7EB] hover:border-[#FF5A1F]/50 active:bg-[#FF5A1F]/5 transition-colors touch-manipulation"
            >
              <span className="text-[#FF5A1F] text-base leading-none">⇄</span>
              <span>Move to new slot</span>
            </button>

            {/* Return to Staging */}
            <button
              onClick={async () => {
                const { assignment } = mobileActionSheet
                setMobileActionSheet(null)
                await removeAssignment(assignment.id)
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#121821] border border-[#232B36] text-sm text-[#6B7280] hover:text-[#E5E7EB] hover:border-[#374151] active:bg-[#232B36] transition-colors touch-manipulation"
            >
              <span className="text-base leading-none">↩</span>
              <span>Return to Staging</span>
            </button>

            {/* Cancel */}
            <button
              onClick={() => setMobileActionSheet(null)}
              className="w-full px-4 py-3.5 rounded-xl text-sm text-[#374151] hover:text-[#6B7280] transition-colors touch-manipulation"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Drag overlay — position driven by direct style mutation, NOT React state */}
      {dragOverlayData && (
        <div
          ref={overlayRef}
          className="fixed pointer-events-none z-[9999]"
          style={{ left: '-9999px', top: '-9999px', transform: 'rotate(1.5deg)' }}
        >
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[#4a5568] bg-[#1e2a3a] shadow-2xl shadow-black/70 w-52">
            <div className="w-7 h-7 rounded-full bg-[#232B36] border border-[#4a5568] flex items-center justify-center text-[10px] font-mono text-[#9CA3AF] flex-shrink-0">
              {getInitials(dragOverlayData.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#E5E7EB] truncate">{dragOverlayData.name}</p>
              {dragOverlayData.sub && (
                <p className="text-[10px] text-[#6B7280] truncate leading-none mt-px">{dragOverlayData.sub}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl ${
          toast.ok ? 'bg-[#22C55E]/20 border border-[#22C55E]/40 text-[#22C55E]' : 'bg-red-500/20 border border-red-500/40 text-red-400'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
