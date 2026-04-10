'use client'

import { useState, useEffect, useMemo } from 'react'
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

// Positions that may only be held once per unit slot
const UNIQUE_POSITIONS = new Set([
  'team_leader','group_supervisor','division_supervisor','branch_director',
  'incident_commander','deputy_incident_commander','safety_officer',
  'public_information_officer','liaison_officer','agency_representative',
  'operations_section_chief','planning_section_chief',
  'logistics_section_chief','finance_admin_section_chief',
])

const COMMAND_SLOTS = [
  { position: 'incident_commander',        label: 'Incident Commander',       short: 'IC' },
  { position: 'deputy_incident_commander', label: 'Deputy IC',                short: 'Dep IC' },
  { position: 'safety_officer',            label: 'Safety Officer',           short: 'Safety' },
  { position: 'public_information_officer',label: 'Public Info Officer',      short: 'PIO' },
  { position: 'liaison_officer',           label: 'Liaison Officer',          short: 'Liaison' },
  { position: 'agency_representative',     label: 'Agency Representative',    short: 'Agency' },
]

const SECTION_DEFS = [
  { key: 'planning',   label: 'Planning Section',    sysKey: '__planning__',   positions: PLANNING_POSITIONS },
  { key: 'logistics',  label: 'Logistics Section',   sysKey: '__logistics__',  positions: LOGISTICS_POSITIONS },
  { key: 'finance',    label: 'Finance / Admin',      sysKey: '__finance__',   positions: FINANCE_POSITIONS },
]

export default function StagePage() {
  const params = useParams()
  const eventId = params.id as string
  const opId    = params.opId as string

  const [op, setOp]                   = useState<any>(null)
  const [profiles, setProfiles]       = useState<any[]>([])
  const [profileMap, setProfileMap]   = useState<Record<string, any>>({})
  const [assignments, setAssignments] = useState<any[]>([])
  const [divisions, setDivisions]     = useState<any[]>([])
  const [groups, setGroups]           = useState<any[]>([])
  const [teams, setTeams]             = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)

  // Staging panel
  const [stagingQuery, setStagingQuery]   = useState('')
  const [mobileStagingOpen, setMobileStagingOpen] = useState(false)

  // DnD
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey]             = useState<string | null>(null)

  // Feedback toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Click-to-assign modal
  const [assigningProfile, setAssigningProfile]     = useState<any | null>(null)
  const [caSection, setCaSection]                   = useState('command')
  const [caTeamId, setCaTeamId]                     = useState('')
  const [caPosition, setCaPosition]                 = useState('')
  const [caError, setCaError]                       = useState<string | null>(null)
  const [caSaving, setCaSaving]                     = useState(false)

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const [
      { data: opData }, { data: pData }, { data: aData },
      { data: divData }, { data: grpData }, { data: teamData },
    ] = await Promise.all([
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('divisions').select('*').eq('operational_period_id', opId),
      supabase.from('groups').select('*').eq('operational_period_id', opId),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
    ])
    setOp(opData)
    setProfiles(pData ?? [])
    setProfileMap((pData ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {}))
    setAssignments(aData ?? [])
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])
    setLoading(false)
  }

  // ── Derived ────────────────────────────────────────────────────
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

  const opsTeams  = useMemo(() => teams.filter((t: any) => !t.name.startsWith('__')), [teams])
  const branches  = useMemo(() => divisions.filter((d: any) => d.type === 'branch'), [divisions])
  const divs      = useMemo(() => divisions.filter((d: any) => d.type === 'division'), [divisions])
  const unassignedGroups = useMemo(() => groups.filter((g: any) => !g.division_id), [groups])
  const unassignedTeams  = useMemo(() => opsTeams.filter((t: any) => !t.group_id && !t.division_id), [opsTeams])

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

  // ── Helpers ────────────────────────────────────────────────────
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function ensureSysTeam(name: string, groupId: string | null, divisionId: string | null): Promise<string | null> {
    if (sysTeamIdMap[name]) return sysTeamIdMap[name]
    const supabase = createClient()
    const { data } = await supabase.from('teams').insert({
      operational_period_id: opId, group_id: groupId, division_id: divisionId, name,
    }).select().single()
    if (data) { setTeams(prev => [...prev, data]); return data.id }
    return null
  }

  // Core assignment writer — used by both drag-drop and click-to-assign
  async function createAssignment(profileId: string, teamId: string, position: string): Promise<boolean> {
    const p = profileMap[profileId]
    if (!p) return false

    if (assignedUserIds.has(profileId)) {
      showToast(`${p.full_name} is already assigned. Use ⇄ Reassign to move them.`, false)
      return false
    }

    if (UNIQUE_POSITIONS.has(position)) {
      const conflict = (assignmentsByTeamId[teamId] ?? []).find((a: any) => a.ics_position === position)
      if (conflict) {
        const who = profileMap[conflict.user_id]?.full_name ?? 'Someone'
        showToast(`${who} already holds ${getPositionLabel(position)}.`, false)
        return false
      }
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: teamId,
      user_id: profileId,
      ics_position: position,
      home_agency: p.default_agency ?? '',
      home_unit: p.default_unit ?? null,
      assigned_by: user!.id,
      dual_hatted: false,
    }).select().single()

    setSaving(false)
    if (error) { showToast(error.message, false); return false }
    setAssignments(prev => [...prev, data])
    showToast(`${p.full_name} → ${getPositionLabel(position)}`, true)
    return true
  }

  // ── DnD ───────────────────────────────────────────────────────
  function dragStart(profileId: string, e: React.DragEvent) {
    setDraggingProfileId(profileId)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('profile-id', profileId)
  }

  function dragEnd() { setDraggingProfileId(null); setDragOverKey(null) }

  function dragOverProps(key: string) {
    return {
      onDragOver:  (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverKey(key) },
      onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) },
    }
  }

  async function handleDrop(e: React.DragEvent, teamId: string, position: string) {
    e.preventDefault()
    const profileId = e.dataTransfer.getData('profile-id')
    setDragOverKey(null)
    if (profileId) await createAssignment(profileId, teamId, position)
  }

  async function handleDropSys(e: React.DragEvent, sysKey: string, position: string, groupId: string | null, divId: string | null) {
    e.preventDefault()
    const profileId = e.dataTransfer.getData('profile-id')
    setDragOverKey(null)
    if (!profileId) return
    const teamId = await ensureSysTeam(sysKey, groupId, divId)
    if (teamId) await createAssignment(profileId, teamId, position)
  }

  // ── Click-to-assign ───────────────────────────────────────────
  function openAssign(p: any) {
    setAssigningProfile(p)
    setCaSection('command'); setCaTeamId(''); setCaPosition(''); setCaError(null)
    setMobileStagingOpen(false)
  }

  async function performClickAssign() {
    if (!assigningProfile || !caPosition) { setCaError('Select a position'); return }
    if (caSection === 'operations' && !caTeamId) { setCaError('Select a team'); return }

    setCaSaving(true); setCaError(null)
    const supabase = createClient()

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

    const ok = await createAssignment(assigningProfile.id, teamId, caPosition)
    setCaSaving(false)
    if (ok) setAssigningProfile(null)
    else setCaError('Assignment failed — see notification')
  }

  // ── Sub-components ────────────────────────────────────────────

  // Empty slot — droppable, with "Assign" button fallback
  function EmptySlot({
    label, dropKey, onDrop, onClickAssign,
  }: { label: string; dropKey: string; onDrop: (e: React.DragEvent) => void; onClickAssign: () => void }) {
    const isOver = dragOverKey === dropKey
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed transition-colors ${
          isOver
            ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
            : draggingProfileId
            ? 'border-[#374151] bg-[#0f1419]'
            : 'border-[#1f2937]'
        }`}
        {...dragOverProps(dropKey)}
        onDrop={onDrop}
      >
        <div className="w-6 h-6 rounded-full bg-[#1a2235] border border-dashed border-[#232B36] flex items-center justify-center flex-shrink-0">
          {isOver
            ? <span className="text-[#FF5A1F] text-xs">↓</span>
            : <span className="text-[#374151] text-xs">+</span>
          }
        </div>
        <span className={`text-xs flex-1 ${isOver ? 'text-[#FF5A1F]' : 'text-[#374151]'}`}>
          {isOver ? `Drop to assign as ${label}` : label}
        </span>
        {!draggingProfileId && (
          <button
            onClick={onClickAssign}
            className="text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono px-1.5 py-0.5 rounded hover:bg-[#FF5A1F]/10"
          >
            Assign
          </button>
        )}
      </div>
    )
  }

  // Filled slot
  function FilledSlot({ label, assignment }: { label: string; assignment: any }) {
    const p = profileMap[assignment.user_id]
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#121821] border border-[#232B36]">
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
      </div>
    )
  }

  // Team block with leader + member drop zone
  function TeamBlock({ team, indent = false }: { team: any; indent?: boolean }) {
    const leaderAssignment = (assignmentsByTeamId[team.id] ?? []).find((a: any) => a.ics_position === 'team_leader') ?? null
    const members = (assignmentsByTeamId[team.id] ?? []).filter((a: any) => a.ics_position !== 'team_leader')
    const memberDropKey = `member:${team.id}`
    const memberIsOver = dragOverKey === memberDropKey

    return (
      <div className={`rounded-lg border border-[#232B36] overflow-hidden ${indent ? 'ml-4' : ''}`}>
        <div className="px-3 py-1.5 bg-[#1a2235]/60 flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#4B5563] uppercase">Team</span>
          <span className="text-xs font-semibold text-[#9CA3AF] flex-1">{team.name}</span>
          <span className="text-[10px] font-mono text-[#374151]">{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="px-3 py-2 space-y-1.5 bg-[#0f1419]/40">
          {leaderAssignment
            ? <FilledSlot label="Team Leader" assignment={leaderAssignment} />
            : <EmptySlot
                label="Team Leader"
                dropKey={`leader:${team.id}`}
                onDrop={e => handleDrop(e, team.id, 'team_leader')}
                onClickAssign={() => { openAssign(null); setCaSection('operations'); setCaTeamId(team.id); setCaPosition('team_leader') }}
              />
          }

          {members.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-[#1f2937]/60">
              {members.map((m: any) => (
                <FilledSlot key={m.id} label={getPositionLabel(m.ics_position)} assignment={m} />
              ))}
            </div>
          )}

          {/* Member drop zone */}
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded border border-dashed transition-colors mt-1 ${
              memberIsOver
                ? 'border-[#38BDF8] bg-[#38BDF8]/10'
                : draggingProfileId
                ? 'border-[#1f2937] bg-[#0f1419]'
                : 'border-[#1a2235]'
            }`}
            {...dragOverProps(memberDropKey)}
            onDrop={e => handleDrop(e, team.id, 'team_member')}
          >
            <span className={`text-[10px] flex-1 font-mono ${memberIsOver ? 'text-[#38BDF8]' : 'text-[#1f2937]'}`}>
              {memberIsOver ? '↓ Drop to add member' : '+ members'}
            </span>
            {!draggingProfileId && (
              <button
                onClick={() => { openAssign(null); setCaSection('operations'); setCaTeamId(team.id); setCaPosition('') }}
                className="text-[10px] text-[#374151] hover:text-[#38BDF8] transition-colors font-mono"
              >
                Add
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Group block
  function GroupBlock({ group, indent = false }: { group: any; indent?: boolean }) {
    const sysKey = `__gr_${group.id}__`
    const sysTeamId = sysTeamIdMap[sysKey]
    const supervisorAssignment = sysTeamId ? (assignmentsByTeamId[sysTeamId] ?? [])[0] ?? null : null
    const groupTeams = opsTeams.filter((t: any) => t.group_id === group.id)

    return (
      <div className={`rounded-xl border border-[#232B36] overflow-hidden ${indent ? 'ml-4' : ''}`}>
        <div className="px-3 py-2 bg-[#161D26] flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider">Group</span>
          <span className="text-sm font-semibold text-[#E5E7EB] flex-1">{group.name}</span>
        </div>
        <div className="px-3 py-2 space-y-2 bg-[#0f1419]/40">
          {supervisorAssignment
            ? <FilledSlot label="Group Supervisor" assignment={supervisorAssignment} />
            : <EmptySlot
                label="Group Supervisor"
                dropKey={`grpsup:${group.id}`}
                onDrop={e => handleDropSys(e, sysKey, 'group_supervisor', group.id, group.division_id ?? null)}
                onClickAssign={() => { openAssign(null); setCaSection('operations') }}
              />
          }
          {groupTeams.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {groupTeams.map((t: any) => <TeamBlock key={t.id} team={t} indent />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Branch / Division block
  function UnitBlock({ unit }: { unit: any }) {
    const isBranch = unit.type === 'branch'
    const sysKey = isBranch ? `__br_${unit.id}__` : `__dv_${unit.id}__`
    const sysTeamId = sysTeamIdMap[sysKey]
    const leaderAssignment = sysTeamId ? (assignmentsByTeamId[sysTeamId] ?? [])[0] ?? null : null
    const leaderRole = isBranch ? 'branch_director' : 'division_supervisor'
    const leaderLabel = isBranch ? 'Branch Director' : 'Division Supervisor'
    const childGroups = groups.filter((g: any) => g.division_id === unit.id)
    const directTeams = opsTeams.filter((t: any) => t.division_id === unit.id && !t.group_id)

    return (
      <div className={`rounded-xl border overflow-hidden ${isBranch ? 'border-orange-900/40' : 'border-sky-900/40'}`}>
        <div className={`px-4 py-2.5 flex items-center gap-2 ${isBranch ? 'bg-orange-950/40' : 'bg-sky-950/40'}`}>
          <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${isBranch ? 'text-orange-400' : 'text-sky-400'}`}>
            {isBranch ? 'Branch' : 'Division'}
          </span>
          <span className="text-sm font-bold text-[#E5E7EB] flex-1">{unit.name}</span>
        </div>
        <div className="px-4 py-3 space-y-2.5 bg-[#0f1419]/30">
          {leaderAssignment
            ? <FilledSlot label={leaderLabel} assignment={leaderAssignment} />
            : <EmptySlot
                label={leaderLabel}
                dropKey={`unit-leader:${unit.id}`}
                onDrop={e => handleDropSys(e, sysKey, leaderRole, null, unit.id)}
                onClickAssign={() => { openAssign(null); setCaSection('operations') }}
              />
          }
          {childGroups.length > 0 && (
            <div className="space-y-2">
              {childGroups.map((g: any) => <GroupBlock key={g.id} group={g} indent />)}
            </div>
          )}
          {directTeams.length > 0 && (
            <div className="space-y-1.5">
              {directTeams.map((t: any) => <TeamBlock key={t.id} team={t} indent />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Staff section block (Planning/Logistics/Finance)
  function StaffSection({ label, sysKey, positions, color }: {
    label: string; sysKey: string; positions: typeof PLANNING_POSITIONS; color: string
  }) {
    const sysTeamId = sysTeamIdMap[sysKey]
    const members = sysTeamId ? (assignmentsByTeamId[sysTeamId] ?? []) : []
    const memberDropKey = `staffsec:${sysKey}`
    const isOver = dragOverKey === memberDropKey

    return (
      <div className="rounded-xl border border-[#232B36] overflow-hidden">
        <div className="px-4 py-2.5 bg-[#161D26] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">{label}</span>
          <span className="text-[10px] font-mono text-[#374151] ml-auto">{members.length} assigned</span>
        </div>
        <div className="px-4 py-3 space-y-1.5 bg-[#0f1419]/30">
          {members.map((a: any) => (
            <FilledSlot key={a.id} label={getPositionLabel(a.ics_position)} assignment={a} />
          ))}
          <div
            className={`flex items-center gap-2 px-2 py-2 rounded border border-dashed transition-colors ${
              isOver
                ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                : draggingProfileId
                ? 'border-[#232B36]'
                : 'border-[#1a2235]'
            }`}
            {...dragOverProps(memberDropKey)}
            onDrop={async e => {
              e.preventDefault()
              const profileId = e.dataTransfer.getData('profile-id')
              setDragOverKey(null)
              if (!profileId) return
              // Default to section chief position on drop — user can reassign
              const chief = positions[0]?.value ?? ''
              if (!chief) return
              const tid = await ensureSysTeam(sysKey, null, null)
              if (tid) await createAssignment(profileId, tid, chief)
            }}
          >
            <span className={`text-[10px] flex-1 font-mono ${isOver ? 'text-[#FF5A1F]' : 'text-[#1f2937]'}`}>
              {isOver ? '↓ Drop to add' : '+ add personnel'}
            </span>
            {!draggingProfileId && (
              <button
                onClick={() => {
                  setAssigningProfile({ id: '__section__', full_name: '' })
                  const secKey = sysKey.replace(/__/g, '')
                  const map: Record<string, string> = {
                    planning: 'planning', logistics: 'logistics', finance: 'finance'
                  }
                  setCaSection(map[secKey] ?? 'planning')
                  setCaTeamId(sysTeamId ?? '')
                  setCaPosition('')
                  setCaError(null)
                }}
                className="text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono"
              >
                Assign
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  const cmdTeamId = sysTeamIdMap['__command__']
  const cmdAssignments = cmdTeamId ? (assignmentsByTeamId[cmdTeamId] ?? []) : []

  // ── Staging panel content ──────────────────────────────────────
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
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {staged.length === 0 && (
          <p className="text-[10px] text-[#374151] text-center py-6 font-mono">
            {stagingQuery ? 'No match' : 'All personnel assigned'}
          </p>
        )}
        {staged.map((p: any) => (
          <div
            key={p.id}
            draggable
            onDragStart={e => dragStart(p.id, e)}
            onDragEnd={dragEnd}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors select-none ${
              draggingProfileId === p.id
                ? 'opacity-40 border-[#FF5A1F]/40 bg-[#FF5A1F]/5'
                : 'border-[#232B36] bg-[#121821] hover:border-[#3a4555] hover:bg-[#161D26]'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-[#1a2235] border border-[#232B36] flex items-center justify-center text-[10px] font-mono text-[#9CA3AF] flex-shrink-0">
              {getInitials(p.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#E5E7EB] truncate">{p.full_name}</p>
              <p className="text-[10px] text-[#4B5563] truncate leading-none mt-px">
                {p.default_agency ?? p.role ?? '—'}
              </p>
            </div>
            <button
              onClick={() => openAssign(p)}
              className="flex-shrink-0 text-[10px] text-[#374151] hover:text-[#FF5A1F] transition-colors font-mono px-1"
              title="Assign"
            >
              →
            </button>
          </div>
        ))}
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
          {/* Mobile staging toggle */}
          <button
            className="md:hidden flex items-center gap-1.5 text-xs text-[#FF5A1F] bg-[#FF5A1F]/10 px-2.5 py-1.5 rounded-lg font-medium"
            onClick={() => setMobileStagingOpen(v => !v)}
          >
            Staging
            <span className="text-[10px] font-mono bg-[#FF5A1F] text-white px-1 rounded">{staged.length}</span>
          </button>
          <Link href={`/events/${eventId}/op/${opId}/build`}
            className="text-[10px] text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex-shrink-0 font-mono">
            Org Builder →
          </Link>
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

        {/* Staging sidebar — desktop only */}
        <aside className="hidden md:flex flex-col w-60 border-r border-[#232B36]/60 sticky top-[92px] h-[calc(100vh-92px)]">
          {StagingContent}
        </aside>

        {/* Org structure */}
        <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-24">

          {saving && (
            <div className="text-[10px] text-[#FF5A1F] font-mono text-center animate-pulse">Saving…</div>
          )}

          {/* Command */}
          {COMMAND_SLOTS.length > 0 && (
            <div className="rounded-xl border border-[#232B36] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#161D26]">
                <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Command</p>
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
                          const profileId = e.dataTransfer.getData('profile-id')
                          setDragOverKey(null)
                          if (!profileId) return
                          const tid = await ensureSysTeam('__command__', null, null)
                          if (tid) await createAssignment(profileId, tid, slot.position)
                        }}
                        onClickAssign={() => {
                          setAssigningProfile({ id: '__cmd__', full_name: '' })
                          setCaSection('command'); setCaTeamId(cmdTeamId ?? ''); setCaPosition(slot.position); setCaError(null)
                        }}
                      />
                })}
              </div>
            </div>
          )}

          {/* Operations */}
          {(branches.length > 0 || divs.length > 0 || unassignedGroups.length > 0 || unassignedTeams.length > 0) && (
            <div className="space-y-3">
              <p className="text-[10px] font-mono text-[#4B5563] uppercase tracking-widest px-1">Operations</p>
              {branches.map((b: any) => <UnitBlock key={b.id} unit={b} />)}
              {divs.map((d: any) => <UnitBlock key={d.id} unit={d} />)}
              {unassignedGroups.map((g: any) => <GroupBlock key={g.id} group={g} />)}
              {unassignedTeams.map((t: any) => <TeamBlock key={t.id} team={t} />)}
            </div>
          )}

          {/* Staff sections */}
          {SECTION_DEFS.map(sec => (
            <StaffSection
              key={sec.key}
              label={sec.label}
              sysKey={sec.sysKey}
              positions={sec.positions}
              color={sec.key === 'planning' ? '#3B82F6' : sec.key === 'logistics' ? '#8B5CF6' : '#6B7280'}
            />
          ))}

          {/* Empty state */}
          {branches.length === 0 && divs.length === 0 && unassignedGroups.length === 0 && unassignedTeams.length === 0 && (
            <div className="text-center py-12 border border-[#232B36] border-dashed rounded-2xl">
              <p className="text-[#4B5563] text-sm">No org structure yet.</p>
              <Link href={`/events/${eventId}/op/${opId}/build`}
                className="text-xs text-[#FF5A1F] hover:text-[#FF6A33] mt-2 inline-block">
                Build org structure →
              </Link>
            </div>
          )}
        </main>
      </div>

      {/* Click-to-assign modal */}
      {assigningProfile && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setAssigningProfile(null)}
        >
          <div
            className="bg-[#161D26] border border-[#232B36] rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">Assign from Staging</p>
              {assigningProfile.full_name && (
                <p className="text-base font-semibold text-[#E5E7EB] mt-0.5">{assigningProfile.full_name}</p>
              )}
            </div>

            {/* Person picker (if opened without a pre-selected person) */}
            {!assigningProfile.full_name && (
              <div>
                <p className="text-xs text-[#6B7280] mb-1.5">Person</p>
                <select
                  className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
                  value={assigningProfile.id === '__cmd__' || assigningProfile.id === '__section__' ? '' : assigningProfile.id}
                  onChange={e => {
                    const p = profiles.find((x: any) => x.id === e.target.value)
                    if (p) setAssigningProfile(p)
                  }}
                >
                  <option value="">Select person…</option>
                  {staged.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.full_name} {p.default_agency ? `(${p.default_agency})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Section */}
            <div>
              <p className="text-xs text-[#6B7280] mb-1.5">Section</p>
              <div className="grid grid-cols-3 gap-1.5">
                {['command','operations','planning','logistics','finance'].map(s => (
                  <button key={s}
                    onClick={() => { setCaSection(s); setCaTeamId(''); setCaPosition('') }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      caSection === s
                        ? 'bg-[#FF5A1F] text-white'
                        : 'bg-[#121821] border border-[#232B36] text-[#6B7280] hover:text-[#E5E7EB]'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Team (ops only) */}
            {caSection === 'operations' && (
              <div>
                <p className="text-xs text-[#6B7280] mb-1.5">Team</p>
                <select
                  value={caTeamId}
                  onChange={e => { setCaTeamId(e.target.value); setCaPosition('') }}
                  className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
                >
                  <option value="">Select team…</option>
                  {opsTeams.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Position */}
            <div>
              <p className="text-xs text-[#6B7280] mb-1.5">Position</p>
              <select
                value={caPosition}
                onChange={e => setCaPosition(e.target.value)}
                className="w-full bg-[#121821] border border-[#232B36] text-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
              >
                <option value="">Select position…</option>
                {caPositions.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {caError && <p className="text-xs text-red-400">{caError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={performClickAssign}
                disabled={caSaving || !caPosition || (caSection === 'operations' && !caTeamId)}
                className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
              >
                {caSaving ? 'Assigning…' : 'Assign'}
              </button>
              <button
                onClick={() => setAssigningProfile(null)}
                className="px-4 bg-[#121821] border border-[#232B36] text-[#6B7280] hover:text-[#E5E7EB] rounded-xl py-2.5 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl transition-all ${
          toast.ok
            ? 'bg-[#22C55E]/20 border border-[#22C55E]/40 text-[#22C55E]'
            : 'bg-red-500/20 border border-red-500/40 text-red-400'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
