'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import Link from 'next/link'
import { HomeButton } from '@/components/ui/HomeButton'

export default function OrgViewPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [divisions, setDivisions] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const [{ data: opData }, { data: aData }, { data: divData },
      { data: grpData }, { data: teamData }] = await Promise.all([
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('divisions').select('*').eq('operational_period_id', opId),
      supabase.from('groups').select('*').eq('operational_period_id', opId),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
    ])
    setOp(opData)
    setAssignments(aData ?? [])
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])

    const userIds = [...new Set((aData ?? []).map((a: any) => a.user_id))]
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds)
      setProfileMap((profs ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {}))
    }
    setLoading(false)
  }

  // ── Derived helpers ────────────────────────────────────────────
  const sysTeamIdMap = useMemo(() => {
    const m: Record<string, string> = {}
    teams.forEach(t => { if (t.name.startsWith('__')) m[t.name] = t.id })
    return m
  }, [teams])

  const assignmentsByTeamId = useMemo(() => {
    const m: Record<string, any[]> = {}
    assignments.forEach(a => {
      if (!m[a.team_id]) m[a.team_id] = []
      m[a.team_id].push(a)
    })
    return m
  }, [assignments])

  function getLeaderByTeamName(name: string) {
    const tId = sysTeamIdMap[name]
    if (!tId) return null
    return (assignmentsByTeamId[tId] ?? [])[0] ?? null
  }

  function getTeamLeader(teamId: string) {
    return (assignmentsByTeamId[teamId] ?? []).find(
      (a: any) => a.ics_position === 'team_leader'
    ) ?? null
  }

  function getTeamMembers(teamId: string) {
    return (assignmentsByTeamId[teamId] ?? []).filter(
      (a: any) => a.ics_position !== 'team_leader'
    )
  }

  function getSection(sysTeamName: string) {
    const tId = sysTeamIdMap[sysTeamName]
    if (!tId) return []
    return assignmentsByTeamId[tId] ?? []
  }

  const opsTeams = useMemo(
    () => teams.filter(t => !t.name.startsWith('__')),
    [teams]
  )
  const branches = useMemo(() => divisions.filter(d => d.type === 'branch'), [divisions])
  const divs = useMemo(() => divisions.filter(d => d.type === 'division'), [divisions])

  // ── Person row ─────────────────────────────────────────────────
  function PersonRow({ a, subtitle }: { a: any; subtitle?: string }) {
    const p = profileMap[a.user_id]
    return (
      <div className="flex items-center gap-2.5 py-1">
        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400 flex-shrink-0">
          {getInitials(p?.full_name ?? '?')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-tight">{p?.full_name ?? 'Unknown'}</p>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {a.dual_hatted && (
          <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
            Dual Hatted
          </span>
        )}
      </div>
    )
  }

  // ── Role label row ─────────────────────────────────────────────
  function RoleRow({ label, a }: { label: string; a: any | null }) {
    if (!a) {
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="text-xs text-zinc-600 w-28 flex-shrink-0">{label}</span>
          <span className="text-xs text-zinc-700 italic">— unassigned —</span>
        </div>
      )
    }
    const p = profileMap[a.user_id]
    return (
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-xs text-zinc-500 w-28 flex-shrink-0 leading-tight">{label}</span>
        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400 flex-shrink-0">
          {getInitials(p?.full_name ?? '?')}
        </div>
        <span className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</span>
        {a.dual_hatted && (
          <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono">
            Dual Hatted
          </span>
        )}
      </div>
    )
  }

  // ── Team block ─────────────────────────────────────────────────
  function TeamBlock({ team, indent = false }: { team: any; indent?: boolean }) {
    const leader = getTeamLeader(team.id)
    const members = getTeamMembers(team.id)
    if (!leader && members.length === 0) {
      return (
        <div className={`${indent ? 'ml-6' : ''} py-1.5`}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-600 uppercase">Team</span>
            <span className="text-sm text-zinc-400">{team.name}</span>
            <span className="text-xs text-zinc-700 italic">— empty —</span>
          </div>
        </div>
      )
    }
    return (
      <div className={`${indent ? 'ml-6' : ''} border border-zinc-800 rounded-lg overflow-hidden`}>
        <div className="px-3 py-1.5 bg-zinc-800/50 flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-500 uppercase">Team</span>
          <span className="text-sm font-medium text-zinc-200">{team.name}</span>
          <span className="text-xs text-zinc-600 ml-auto">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="px-3 py-2 space-y-0.5">
          <RoleRow label="Team Leader" a={leader} />
          {members.length > 0 && (
            <div className="pt-1 mt-1 border-t border-zinc-800/60 space-y-0.5">
              {members.map((m: any) => (
                <PersonRow key={m.id} a={m} subtitle={getPositionLabel(m.ics_position)} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Group block ────────────────────────────────────────────────
  function GroupBlock({ group, indent = false }: { group: any; indent?: boolean }) {
    const leader = getLeaderByTeamName(`__gr_${group.id}__`)
    const groupTeams = opsTeams.filter(t => t.group_id === group.id)
    return (
      <div className={`${indent ? 'ml-6' : ''} border border-zinc-700 rounded-xl overflow-hidden`}>
        <div className="px-3 py-2 bg-zinc-800 flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Group</span>
          <span className="text-sm font-semibold text-zinc-100">{group.name}</span>
        </div>
        <div className="px-3 py-2 space-y-2 bg-zinc-900/40">
          <RoleRow label="Supervisor" a={leader} />
          {groupTeams.length > 0 && (
            <div className="space-y-2 pt-1">
              {groupTeams.map(t => <TeamBlock key={t.id} team={t} indent />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Branch / Division block ────────────────────────────────────
  function UnitBlock({ unit }: { unit: any }) {
    const isBranch = unit.type === 'branch'
    const leader = getLeaderByTeamName(isBranch ? `__br_${unit.id}__` : `__dv_${unit.id}__`)
    const childGroups = groups.filter(g => g.division_id === unit.id)
    const directTeams = opsTeams.filter(t => t.division_id === unit.id && !t.group_id)

    return (
      <div className={`border rounded-xl overflow-hidden ${
        isBranch ? 'border-orange-900/50' : 'border-sky-900/50'
      }`}>
        <div className={`px-4 py-2.5 flex items-center gap-2 ${
          isBranch ? 'bg-orange-950/50' : 'bg-sky-950/50'
        }`}>
          <span className={`text-xs font-mono font-semibold uppercase tracking-wider ${
            isBranch ? 'text-orange-400' : 'text-sky-400'
          }`}>
            {isBranch ? 'Branch' : 'Division'}
          </span>
          <span className="text-sm font-bold text-zinc-100">{unit.name}</span>
        </div>
        <div className="px-4 py-3 space-y-3 bg-zinc-900/30">
          <RoleRow label={isBranch ? 'Director' : 'Supervisor'} a={leader} />
          {childGroups.length > 0 && (
            <div className="space-y-2">
              {childGroups.map(g => <GroupBlock key={g.id} group={g} indent />)}
            </div>
          )}
          {directTeams.length > 0 && (
            <div className="space-y-2">
              {directTeams.map(t => <TeamBlock key={t.id} team={t} indent />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Section block ──────────────────────────────────────────────
  function SectionBlock({
    title, sysKey, color,
  }: { title: string; sysKey: string; color: string }) {
    const members = getSection(sysKey)
    if (members.length === 0) return null
    return (
      <div className={`border rounded-xl overflow-hidden ${color}`}>
        <div className="px-4 py-2.5 bg-zinc-800/60">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">{title}</p>
        </div>
        <div className="px-4 py-3 space-y-0.5 bg-zinc-900/30">
          {members.map((a: any) => (
            <PersonRow key={a.id} a={a} subtitle={getPositionLabel(a.ics_position)} />
          ))}
        </div>
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Loading...</p>
    </div>
  )

  const commandMembers = assignments.filter(a =>
    ['incident_commander','deputy_incident_commander','safety_officer',
     'public_information_officer','liaison_officer','agency_representative'].includes(a.ics_position)
  )

  const unassignedGroups = groups.filter(g => !g.division_id)
  const unassignedTeams = opsTeams.filter(t => !t.group_id && !t.division_id)

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Org Chart</p>
          <h1 className="text-xl font-semibold text-zinc-100">Operational Period {op?.period_number}</h1>
          <p className="text-xs font-mono text-zinc-500 mt-1">
            {new Date(op?.op_period_start).toLocaleString()} — {new Date(op?.op_period_end).toLocaleString()}
          </p>
        </div>
        <Link href={`/events/${eventId}/op/${opId}/build`}
          className="text-xs text-orange-500 hover:text-orange-400 mt-1">
          Edit →
        </Link>
      </div>

      <div className="space-y-4">

        {/* Command */}
        {commandMembers.length > 0 && (
          <div className="border border-zinc-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-800">
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-300">Command</p>
            </div>
            <div className="px-4 py-3 space-y-0.5 bg-zinc-900/40">
              {commandMembers.map(a => (
                <PersonRow key={a.id} a={a} subtitle={getPositionLabel(a.ics_position)} />
              ))}
            </div>
          </div>
        )}

        {/* Operations */}
        {(branches.length > 0 || divs.length > 0 || unassignedGroups.length > 0 || unassignedTeams.length > 0) && (
          <div className="space-y-3">
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider px-1">Operations</p>
            {branches.map(b => <UnitBlock key={b.id} unit={b} />)}
            {divs.map(d => <UnitBlock key={d.id} unit={d} />)}
            {unassignedGroups.map(g => <GroupBlock key={g.id} group={g} />)}
            {unassignedTeams.map(t => <TeamBlock key={t.id} team={t} />)}
          </div>
        )}

        {/* Staff Sections */}
        <SectionBlock title="Planning Section" sysKey="__planning__" color="border-zinc-700" />
        <SectionBlock title="Logistics Section" sysKey="__logistics__" color="border-zinc-700" />
        <SectionBlock title="Finance / Admin Section" sysKey="__finance__" color="border-zinc-700" />

        {assignments.length === 0 && (
          <div className="text-center py-10 text-zinc-600">
            <p>No assignments yet.</p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <Link href={`/events/${eventId}`} className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Back to Event
        </Link>
      </div>
    </div>
  )
}
