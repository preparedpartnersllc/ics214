'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { getPositionLabel, ICS_POSITIONS } from '@/lib/ics-positions'
import Link from 'next/link'

// ── Activity status ──────────────────────────────────────────────
const ACTIVE_THRESHOLD_MIN = 15 // configurable — minutes before status becomes WARNING

function fmtAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function getActivityStatus(assignmentId: string, map: Record<string, string>): 'active' | 'warning' | 'not_checked_in' {
  const last = map[assignmentId]
  if (!last) return 'not_checked_in'
  const mins = (Date.now() - new Date(last).getTime()) / 60_000
  return mins <= ACTIVE_THRESHOLD_MIN ? 'active' : 'warning'
}

const STATUS_COLOR = {
  active:          '#22C55E',
  warning:         '#F59E0B',
  not_checked_in:  '#374151',
}

// ── Section helpers ──────────────────────────────────────────────
const CMD_POS = new Set([
  'incident_commander','deputy_incident_commander','safety_officer',
  'public_information_officer','liaison_officer','agency_representative',
])
const OPS_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Operations Section').map(p => p.value))
const PLN_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Planning Section').map(p => p.value))
const LOG_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Logistics Section').map(p => p.value))
const FIN_POS = new Set(ICS_POSITIONS.filter(p => p.section === 'Finance/Admin Section').map(p => p.value))

function getSection(pos: string): string {
  if (CMD_POS.has(pos)) return 'Command'
  if (OPS_POS.has(pos)) return 'Operations'
  if (PLN_POS.has(pos)) return 'Planning'
  if (LOG_POS.has(pos)) return 'Logistics'
  if (FIN_POS.has(pos)) return 'Finance'
  return 'Other'
}

// ── Role tags ───────────────────────────────────────────────────
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

const LEADER_PRIORITY = [
  'incident_commander','deputy_incident_commander','safety_officer',
  'public_information_officer','liaison_officer','agency_representative',
  'operations_section_chief','operations_section_deputy',
  'branch_director','division_supervisor','division_group_supervisor',
  'group_supervisor','staging_area_manager','air_ops_branch_director',
  'planning_section_chief','logistics_section_chief','finance_admin_section_chief',
  'team_leader',
]
const leaderRank = (pos: string) => {
  const i = LEADER_PRIORITY.indexOf(pos)
  return i === -1 ? 999 : i
}

type FilterSection = 'All' | 'Command' | 'Operations' | 'Planning' | 'Logistics' | 'Finance'

export default function RosterPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<any>(null)
  const [ops, setOps] = useState<any[]>([])
  const [selectedOpId, setSelectedOpId] = useState<string>('')
  const [assignments, setAssignments] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, any>>({})
  const [teams, setTeams] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [divisions, setDivisions] = useState<any[]>([])
  const [lastEntryMap, setLastEntryMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [opLoading, setOpLoading] = useState(false)

  // ── Controls ─────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<FilterSection>('All')
  const [unitFilter, setUnitFilter] = useState('')
  const [sortBy, setSortBy] = useState<'rank' | 'alpha'>('rank')

  useEffect(() => { loadEvent() }, [eventId])
  useEffect(() => { if (selectedOpId) loadOp(selectedOpId) }, [selectedOpId])

  async function loadEvent() {
    const supabase = createClient()
    const [{ data: ev }, { data: opData }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('operational_periods').select('*').eq('event_id', eventId).order('period_number'),
    ])
    setEvent(ev)
    setOps(opData ?? [])
    // Default to the active OP, or most recent
    const active = (opData ?? []).find((o: any) => o.status === 'active')
    const defaultOp = active ?? (opData ?? []).slice(-1)[0]
    if (defaultOp) setSelectedOpId(defaultOp.id)
    else setLoading(false)
  }

  async function loadOp(opId: string) {
    setOpLoading(true)
    const supabase = createClient()
    const [{ data: aData }, { data: divData }, { data: grpData }, { data: teamData }] =
      await Promise.all([
        supabase.from('assignments').select('*').eq('operational_period_id', opId),
        supabase.from('divisions').select('*').eq('operational_period_id', opId),
        supabase.from('groups').select('*').eq('operational_period_id', opId),
        supabase.from('teams').select('*').eq('operational_period_id', opId),
      ])
    setAssignments(aData ?? [])
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])

    const userIds = [...new Set((aData ?? []).map((a: any) => a.user_id))]
    const assignmentIds = (aData ?? []).map((a: any) => a.id)

    const [profResult, entryResult] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('*').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      assignmentIds.length > 0
        ? supabase.from('activity_entries').select('assignment_id, entry_time').in('assignment_id', assignmentIds).order('entry_time', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ])

    setProfileMap((profResult.data ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {}))

    const entryMap: Record<string, string> = {}
    ;(entryResult.data ?? []).forEach((e: any) => {
      if (!entryMap[e.assignment_id]) entryMap[e.assignment_id] = e.entry_time
    })
    setLastEntryMap(entryMap)

    setLoading(false)
    setOpLoading(false)
  }

  // ── Structure helpers ─────────────────────────────────────────
  const sysTeamIdMap = useMemo(() => {
    const m: Record<string, string> = {}
    teams.forEach(t => { if (t.name.startsWith('__')) m[t.name] = t.id })
    return m
  }, [teams])

  const teamById = useMemo(() => {
    const m: Record<string, any> = {}
    teams.forEach(t => { m[t.id] = t })
    return m
  }, [teams])

  const groupById = useMemo(() => {
    const m: Record<string, any> = {}
    groups.forEach(g => { m[g.id] = g })
    return m
  }, [groups])

  const divById = useMemo(() => {
    const m: Record<string, any> = {}
    divisions.forEach(d => { m[d.id] = d })
    return m
  }, [divisions])

  // Resolve unit label for an assignment
  function getUnitLabel(a: any): string {
    const team = teamById[a.team_id]
    if (!team) return ''
    if (team.name === '__command__') return 'Command Staff'
    if (team.name === '__planning__') return 'Planning Section'
    if (team.name === '__logistics__') return 'Logistics Section'
    if (team.name === '__finance__') return 'Finance / Admin'
    if (team.name.startsWith('__br_')) {
      const div = divById[team.division_id]
      return div ? `${div.name} (Branch)` : 'Branch'
    }
    if (team.name.startsWith('__dv_')) {
      const div = divById[team.division_id]
      return div ? `${div.name} (Division)` : 'Division'
    }
    if (team.name.startsWith('__gr_')) {
      const grp = groupById[team.group_id]
      return grp ? `${grp.name} (Group)` : 'Group'
    }
    // Regular team
    let label = team.name
    if (team.group_id && groupById[team.group_id]) label = `${groupById[team.group_id].name} / ${label}`
    const divId = team.division_id ?? groupById[team.group_id]?.division_id
    if (divId && divById[divId]) label = `${divById[divId].name} / ${label}`
    return label
  }

  // ── Unit filter options ───────────────────────────────────────
  const unitOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: 'All Units' }]
    const seen = new Set<string>()

    assignments.forEach(a => {
      const label = getUnitLabel(a)
      if (label && !seen.has(label)) {
        seen.add(label)
        opts.push({ value: label, label })
      }
    })
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [assignments, teamById, groupById, divById])

  // ── Filtered + sorted list ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = assignments.filter(a => {
      const p = profileMap[a.user_id]
      const name = (p?.full_name ?? '').toLowerCase()
      const posLabel = getPositionLabel(a.ics_position).toLowerCase()
      const unit = getUnitLabel(a).toLowerCase()

      if (query && !name.includes(query.toLowerCase()) && !posLabel.includes(query.toLowerCase()) && !unit.includes(query.toLowerCase())) return false
      if (sectionFilter !== 'All' && getSection(a.ics_position) !== sectionFilter) return false
      if (unitFilter && getUnitLabel(a) !== unitFilter) return false
      return true
    })

    if (sortBy === 'rank') {
      list = [...list].sort((a, b) => leaderRank(a.ics_position) - leaderRank(b.ics_position))
    } else {
      list = [...list].sort((a, b) => {
        const na = profileMap[a.user_id]?.full_name ?? ''
        const nb = profileMap[b.user_id]?.full_name ?? ''
        return na.localeCompare(nb)
      })
    }
    return list
  }, [assignments, query, sectionFilter, unitFilter, sortBy, profileMap])

  // ── Grouped view (when no filters active) ─────────────────────
  const isFiltered = query !== '' || sectionFilter !== 'All' || unitFilter !== ''

  // Groups for unfiltered view: Command, then Ops structure, then Sections
  const grouped = useMemo(() => {
    if (isFiltered) return null

    const opsTeams = teams.filter(t => !t.name.startsWith('__'))
    const branches = divisions.filter(d => d.type === 'branch')
    const divs = divisions.filter(d => d.type === 'division')

    function teamAssignments(teamId: string) {
      return assignments
        .filter(a => a.team_id === teamId)
        .sort((a, b) => leaderRank(a.ics_position) - leaderRank(b.ics_position))
    }

    function sysAssignments(sysKey: string) {
      const tId = sysTeamIdMap[sysKey]
      if (!tId) return []
      return assignments.filter(a => a.team_id === tId)
        .sort((a, b) => leaderRank(a.ics_position) - leaderRank(b.ics_position))
    }

    // Build groups list
    const result: Array<{
      key: string
      label: string
      color: string
      items: any[]
      sub?: Array<{ key: string; label: string; type: string; items: any[]; sub?: any[] }>
    }> = []

    // Command
    const cmdItems = assignments.filter(a => CMD_POS.has(a.ics_position))
      .sort((a, b) => leaderRank(a.ics_position) - leaderRank(b.ics_position))
    if (cmdItems.length > 0) {
      result.push({ key: 'cmd', label: 'Command', color: '#F59E0B', items: cmdItems })
    }

    // Operations — build the tree as flat rows with depth info
    const hasOps = branches.length > 0 || divs.length > 0 ||
      groups.some(g => !g.division_id) || opsTeams.some(t => !t.group_id && !t.division_id)

    if (hasOps) {
      const opsItems: any[] = []

      // Section chief/deputy row
      const sectionRows = assignments.filter(a =>
        ['operations_section_chief','operations_section_deputy','staging_area_manager',
         'air_ops_branch_director'].includes(a.ics_position)
      )
      sectionRows.forEach(a => opsItems.push({ ...a, _depth: 0 }))

      // Branches
      branches.forEach(branch => {
        const leaderTeamId = sysTeamIdMap[`__br_${branch.id}__`]
        const leader = leaderTeamId ? assignments.find(a => a.team_id === leaderTeamId) : null
        opsItems.push({ _header: true, _type: 'branch', _label: branch.name, _depth: 0 })
        if (leader) opsItems.push({ ...leader, _depth: 1 })

        groups.filter(g => g.division_id === branch.id).forEach(grp => {
          const glId = sysTeamIdMap[`__gr_${grp.id}__`]
          const gl = glId ? assignments.find(a => a.team_id === glId) : null
          opsItems.push({ _header: true, _type: 'group', _label: grp.name, _depth: 1 })
          if (gl) opsItems.push({ ...gl, _depth: 2 })
          opsTeams.filter(t => t.group_id === grp.id).forEach(t => {
            opsItems.push({ _header: true, _type: 'team', _label: t.name, _depth: 2 })
            teamAssignments(t.id).forEach(a => opsItems.push({ ...a, _depth: 3 }))
          })
        })
        opsTeams.filter(t => t.division_id === branch.id && !t.group_id).forEach(t => {
          opsItems.push({ _header: true, _type: 'team', _label: t.name, _depth: 1 })
          teamAssignments(t.id).forEach(a => opsItems.push({ ...a, _depth: 2 }))
        })
      })

      // Divisions
      divs.forEach(div => {
        const leaderTeamId = sysTeamIdMap[`__dv_${div.id}__`]
        const leader = leaderTeamId ? assignments.find(a => a.team_id === leaderTeamId) : null
        opsItems.push({ _header: true, _type: 'division', _label: div.name, _depth: 0 })
        if (leader) opsItems.push({ ...leader, _depth: 1 })
        groups.filter(g => g.division_id === div.id).forEach(grp => {
          const glId = sysTeamIdMap[`__gr_${grp.id}__`]
          const gl = glId ? assignments.find(a => a.team_id === glId) : null
          opsItems.push({ _header: true, _type: 'group', _label: grp.name, _depth: 1 })
          if (gl) opsItems.push({ ...gl, _depth: 2 })
          opsTeams.filter(t => t.group_id === grp.id).forEach(t => {
            opsItems.push({ _header: true, _type: 'team', _label: t.name, _depth: 2 })
            teamAssignments(t.id).forEach(a => opsItems.push({ ...a, _depth: 3 }))
          })
        })
        opsTeams.filter(t => t.division_id === div.id && !t.group_id).forEach(t => {
          opsItems.push({ _header: true, _type: 'team', _label: t.name, _depth: 1 })
          teamAssignments(t.id).forEach(a => opsItems.push({ ...a, _depth: 2 }))
        })
      })

      // Unassigned groups
      groups.filter(g => !g.division_id).forEach(grp => {
        const glId = sysTeamIdMap[`__gr_${grp.id}__`]
        const gl = glId ? assignments.find(a => a.team_id === glId) : null
        opsItems.push({ _header: true, _type: 'group', _label: grp.name, _depth: 0 })
        if (gl) opsItems.push({ ...gl, _depth: 1 })
        opsTeams.filter(t => t.group_id === grp.id).forEach(t => {
          opsItems.push({ _header: true, _type: 'team', _label: t.name, _depth: 1 })
          teamAssignments(t.id).forEach(a => opsItems.push({ ...a, _depth: 2 }))
        })
      })

      // Unassigned teams
      opsTeams.filter(t => !t.group_id && !t.division_id).forEach(t => {
        opsItems.push({ _header: true, _type: 'team', _label: t.name, _depth: 0 })
        teamAssignments(t.id).forEach(a => opsItems.push({ ...a, _depth: 1 }))
      })

      if (opsItems.length > 0) {
        result.push({ key: 'ops', label: 'Operations', color: '#22C55E', items: opsItems })
      }
    }

    // Staff sections
    const planItems = sysAssignments('__planning__')
    if (planItems.length > 0) result.push({ key: 'pln', label: 'Planning', color: '#3B82F6', items: planItems })

    const logItems = sysAssignments('__logistics__')
    if (logItems.length > 0) result.push({ key: 'log', label: 'Logistics', color: '#8B5CF6', items: logItems })

    const finItems = sysAssignments('__finance__')
    if (finItems.length > 0) result.push({ key: 'fin', label: 'Finance / Admin', color: '#6B7280', items: finItems })

    return result
  }, [isFiltered, assignments, teams, groups, divisions, sysTeamIdMap, profileMap])

  const selectedOp = ops.find(o => o.id === selectedOpId)

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading...</p>
    </div>
  )

  // ── Person row ─────────────────────────────────────────────────
  function PersonRow({ a, showUnit = false }: { a: any; showUnit?: boolean }) {
    const p = profileMap[a.user_id]
    const name = p?.full_name ?? 'Unknown'
    const unit = showUnit ? getUnitLabel(a) : ''
    const roleTag = ROLE_TAG[a.ics_position]
    const unitContext = unit && unit !== 'Command Staff' && unit !== 'Planning Section'
      && unit !== 'Logistics Section' && unit !== 'Finance / Admin' ? unit : ''
    return (
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#121821] border border-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
          {getInitials(name)}
        </div>

        {/* Name + role tag + position */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-[#E5E7EB] truncate">{name}</p>
            {roleTag && (
              <span
                className="text-[10px] font-bold px-1.5 py-px rounded flex-shrink-0 font-mono"
                style={{ color: roleTag.color, backgroundColor: roleTag.color + '18' }}
              >
                {roleTag.tag}
              </span>
            )}
            {a.dual_hatted && (
              <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-px rounded flex-shrink-0 font-mono">
                DH
              </span>
            )}
          </div>
          <p className="text-xs text-[#4B5563] truncate leading-tight mt-px">
            {getPositionLabel(a.ics_position)}
            {unitContext ? <span className="text-[#374151]"> · {unitContext}</span> : null}
          </p>
        </div>

        {/* Activity status */}
        {(() => {
          const status = getActivityStatus(a.id, lastEntryMap)
          const last = lastEntryMap[a.id]
          return (
            <div className="flex-shrink-0 flex flex-col items-end gap-0.5 min-w-[44px]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
              <p className="text-[10px] text-[#4B5563] leading-none">
                {last ? fmtAgo(last) : 'No log'}
              </p>
            </div>
          )
        })()}
      </div>
    )
  }

  // ── Section header ─────────────────────────────────────────────
  function SectionHeader({ label, color, count }: { label: string; color: string; count: number }) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-[#121821] border-b border-[#232B36]/60">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">{label}</p>
        </div>
        <span className="text-xs font-mono text-[#4B5563]">{count}</span>
      </div>
    )
  }

  // ── Depth indent config ────────────────────────────────────────
  const DEPTH_COLORS: Record<string, string> = {
    branch: 'text-[#F97316]',
    division: 'text-[#38BDF8]',
    group: 'text-[#A3E635]',
    team: 'text-[#94A3B8]',
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      {/* ── Header ── */}
      <header className="sticky top-12 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        <div className="px-4 py-3 max-w-2xl mx-auto flex items-center gap-4">
          <Link href={`/events/${eventId}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex-shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Event
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#E5E7EB] truncate">{event?.name}</p>
            <p className="text-xs text-[#6B7280]">Personnel Roster</p>
          </div>
          {/* OP selector */}
          {ops.length > 1 && (
            <select
              value={selectedOpId}
              onChange={e => { setSelectedOpId(e.target.value); setQuery(''); setSectionFilter('All'); setUnitFilter('') }}
              className="text-xs bg-[#161D26] border border-[#232B36] text-[#9CA3AF] rounded-lg px-2 py-1.5 flex-shrink-0"
            >
              {ops.map(o => (
                <option key={o.id} value={o.id}>
                  OP {o.period_number} {o.status === 'active' ? '(active)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto pb-24">

        {/* ── Stats bar ── */}
        {!opLoading && selectedOp && (() => {
          const SECTION_DEFS = [
            { label: 'CMD', section: 'Command'    as FilterSection, set: CMD_POS, color: '#F59E0B' },
            { label: 'OPS', section: 'Operations' as FilterSection, set: OPS_POS, color: '#22C55E' },
            { label: 'PLN', section: 'Planning'   as FilterSection, set: PLN_POS, color: '#3B82F6' },
            { label: 'LOG', section: 'Logistics'  as FilterSection, set: LOG_POS, color: '#8B5CF6' },
            { label: 'FIN', section: 'Finance'    as FilterSection, set: FIN_POS, color: '#6B7280' },
          ]
          const counts = SECTION_DEFS.map(s => ({
            ...s, count: assignments.filter(a => s.set.has(a.ics_position)).length,
          })).filter(s => s.count > 0)

          return (
            <div className="mb-5">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#E5E7EB] leading-none tabular-nums">
                  {assignments.length}
                </span>
                <span className="text-xs text-[#6B7280]">
                  assigned · OP {selectedOp.period_number}
                  {selectedOp.status === 'active' && (
                    <span className="ml-1.5 text-[#22C55E]">● active</span>
                  )}
                </span>
              </div>
              {counts.length > 0 && (
                <div className="flex items-center gap-0 mt-1 flex-wrap">
                  {counts.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSectionFilter(sectionFilter === s.section ? 'All' : s.section)}
                      className={`text-[11px] font-mono transition-colors mr-3 ${
                        sectionFilter === s.section ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ color: s.color }}
                    >
                      {s.label} {s.count}
                    </button>
                  ))}
                  {sectionFilter !== 'All' && (
                    <button onClick={() => setSectionFilter('All')}
                      className="text-[10px] text-[#4B5563] hover:text-[#6B7280] ml-1">
                      × clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Search bar ── */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4B5563]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="w-full bg-[#161D26] border border-[#232B36] text-[#E5E7EB] placeholder-[#4B5563] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#FF5A1F]/50 focus:ring-1 focus:ring-[#FF5A1F]/20 transition-colors"
            placeholder="Search by name, position, or unit…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── Filter row ── */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {/* Section pills */}
          {(['All','Command','Operations','Planning','Logistics','Finance'] as FilterSection[]).map(s => (
            <button key={s}
              onClick={() => setSectionFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                sectionFilter === s
                  ? 'bg-[#FF5A1F] text-white'
                  : 'bg-[#161D26] border border-[#232B36] text-[#6B7280] hover:text-[#E5E7EB] hover:border-[#3a4555]'
              }`}>
              {s}
            </button>
          ))}

          <div className="flex-1" />

          {/* Unit filter */}
          {unitOptions.length > 1 && (
            <select
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              className="text-xs bg-[#161D26] border border-[#232B36] text-[#6B7280] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#FF5A1F]/50">
              {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          {/* Sort toggle */}
          <button
            onClick={() => setSortBy(s => s === 'rank' ? 'alpha' : 'rank')}
            className="text-xs text-[#6B7280] hover:text-[#E5E7EB] border border-[#232B36] rounded-lg px-2.5 py-1.5 transition-colors">
            {sortBy === 'rank' ? 'A–Z' : 'Rank'}
          </button>
        </div>

        {/* ── Clear filters ── */}
        {isFiltered && (
          <button
            onClick={() => { setQuery(''); setSectionFilter('All'); setUnitFilter('') }}
            className="text-xs text-[#FF5A1F] hover:text-[#FF6A33] mb-4 transition-colors">
            Clear filters · {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </button>
        )}

        {opLoading ? (
          <div className="text-center py-12">
            <p className="text-[#6B7280] text-sm">Loading…</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-12 border border-[#232B36] border-dashed rounded-2xl">
            <p className="text-[#6B7280] text-sm">No one assigned to this operational period.</p>
          </div>
        ) : isFiltered ? (
          /* ── Flat filtered list ── */
          <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-center text-[#6B7280] text-sm py-8">No results.</p>
            ) : (
              filtered.map((a: any, i: number) => (
                <div key={a.id} className={i < filtered.length - 1 ? 'border-b border-[#232B36]/40' : ''}>
                  <PersonRow a={a} showUnit />
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Grouped view ── */
          <div className="space-y-4">
            {grouped?.map(group => (
              <div key={group.key} className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
                <SectionHeader
                  label={group.label}
                  color={group.color}
                  count={group.items.filter((x: any) => !x._header).length}
                />
                <div>
                  {group.items.map((item: any, i: number) => {
                    if (item._header) {
                      // Unit sub-header
                      const paddingLeft = item._depth * 12 + 16
                      return (
                        <div key={`h-${item._type}-${item._label}-${i}`}
                          className="flex items-center gap-1.5 py-1.5 border-b border-[#232B36]/30"
                          style={{ paddingLeft }}>
                          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${DEPTH_COLORS[item._type] ?? 'text-[#4B5563]'}`}>
                            {item._type}
                          </span>
                          <span className="text-xs text-[#9CA3AF] font-medium">{item._label}</span>
                        </div>
                      )
                    }
                    const isLast = i === group.items.length - 1
                    const paddingLeft = (item._depth ?? 0) * 12
                    return (
                      <div key={item.id}
                        className={`${!isLast ? 'border-b border-[#232B36]/30' : ''}`}
                        style={{ paddingLeft }}>
                        <PersonRow a={item} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
