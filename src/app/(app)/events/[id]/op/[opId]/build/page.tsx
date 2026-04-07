 'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { ICS_POSITIONS, getPositionLabel } from '@/lib/ics-positions'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

export default function BuildOrgPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [divisions, setDivisions] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<any>({})
  const [loading, setLoading] = useState(true)

  // Form states
  const [divName, setDivName] = useState('')
  const [divType, setDivType] = useState<'division' | 'branch'>('division')
  const [grpName, setGrpName] = useState('')
  const [grpDivId, setGrpDivId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamGrpId, setTeamGrpId] = useState('')
  const [assignUser, setAssignUser] = useState('')
  const [assignTeam, setAssignTeam] = useState('')
  const [assignPosition, setAssignPosition] = useState('')
  const [assignAgency, setAssignAgency] = useState('')
  const [assignUnit, setAssignUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const [{ data: opData }, { data: divData }, { data: grpData },
      { data: teamData }, { data: aData }, { data: pData }] = await Promise.all([
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('divisions').select('*').eq('operational_period_id', opId),
      supabase.from('groups').select('*').eq('operational_period_id', opId),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    setOp(opData)
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])
    setAssignments(aData ?? [])
    setProfiles(pData ?? [])
    const map = (pData ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {})
    setProfileMap(map)
    setLoading(false)
  }

  async function addDivision() {
    if (!divName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('divisions')
      .insert({ operational_period_id: opId, name: divName.trim(), type: divType })
      .select().single()
    if (data) { setDivisions(prev => [...prev, data]); setDivName('') }
    setSaving(false)
  }

  async function addGroup() {
    if (!grpName.trim() || !grpDivId) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('groups')
      .insert({ operational_period_id: opId, division_id: grpDivId, name: grpName.trim() })
      .select().single()
    if (data) { setGroups(prev => [...prev, data]); setGrpName('') }
    setSaving(false)
  }

  async function addTeam() {
    if (!teamName.trim() || !teamGrpId) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('teams')
      .insert({ operational_period_id: opId, group_id: teamGrpId, name: teamName.trim() })
      .select().single()
    if (data) { setTeams(prev => [...prev, data]); setTeamName('') }
    setSaving(false)
  }

  async function addAssignment() {
    if (!assignUser || !assignTeam || !assignPosition || !assignAgency) {
      setError('All fields required except unit'); return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase.from('assignments')
      .insert({
        operational_period_id: opId,
        team_id: assignTeam,
        user_id: assignUser,
        ics_position: assignPosition,
        home_agency: assignAgency,
        home_unit: assignUnit || null,
        assigned_by: user!.id,
      })
      .select().single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) {
      setAssignments(prev => [...prev, data])
      setAssignUser(''); setAssignTeam(''); setAssignPosition('')
    }
    setSaving(false)
  }

  async function deleteItem(table: string, id: string) {
    const supabase = createClient()
    await supabase.from(table).delete().eq('id', id)
    if (table === 'divisions') setDivisions(prev => prev.filter(d => d.id !== id))
    if (table === 'groups') setGroups(prev => prev.filter(g => g.id !== id))
    if (table === 'teams') setTeams(prev => prev.filter(t => t.id !== id))
    if (table === 'assignments') setAssignments(prev => prev.filter(a => a.id !== id))
  }

  const assignedUserIds = assignments.map(a => a.user_id)
  const unassignedProfiles = profiles.filter(p => !assignedUserIds.includes(p.id))
  const positionSections = [...new Set(ICS_POSITIONS.map(p => p.section))]

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin — Org Builder</p>
        <h1 className="text-xl font-semibold text-zinc-100">
          Operational Period {op?.period_number}
        </h1>
        <p className="text-xs font-mono text-zinc-500 mt-1">
          {new Date(op?.op_period_start).toLocaleString()} — {new Date(op?.op_period_end).toLocaleString()}
        </p>
      </div>

      {/* Step 1: Add Division/Branch */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
          Step 1 — Add Division or Branch
        </p>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setDivType('division')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${divType === 'division' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
            Division
          </button>
          <button onClick={() => setDivType('branch')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${divType === 'branch' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
            Branch
          </button>
        </div>
        <div className="flex gap-2">
          <input type="text" className="input flex-1" value={divName}
            onChange={e => setDivName(e.target.value)}
            placeholder={`e.g. North ${divType === 'division' ? 'Division' : 'Branch'}`} />
          <Button onClick={addDivision} loading={saving} variant="secondary">Add</Button>
        </div>
        {divisions.length > 0 && (
          <div className="mt-3 space-y-1">
            {divisions.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1.5 px-3 bg-zinc-800 rounded-lg">
                <span className="text-sm text-zinc-200">{d.name} <span className="text-zinc-500 text-xs">({d.type})</span></span>
                <button onClick={() => deleteItem('divisions', d.id)} className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Add Group */}
      {divisions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
            Step 2 — Add Group
          </p>
          <div className="space-y-3">
            <FormField label="Under Division/Branch">
              <select className="input" value={grpDivId} onChange={e => setGrpDivId(e.target.value)}>
                <option value="">-- Select --</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
              </select>
            </FormField>
            <div className="flex gap-2">
              <input type="text" className="input flex-1" value={grpName}
                onChange={e => setGrpName(e.target.value)}
                placeholder="e.g. Search Group" />
              <Button onClick={addGroup} loading={saving} variant="secondary">Add</Button>
            </div>
          </div>
          {groups.length > 0 && (
            <div className="mt-3 space-y-1">
              {groups.map(g => {
                const div = divisions.find(d => d.id === g.division_id)
                return (
                  <div key={g.id} className="flex items-center justify-between py-1.5 px-3 bg-zinc-800 rounded-lg">
                    <span className="text-sm text-zinc-200">{g.name} <span className="text-zinc-500 text-xs">→ {div?.name}</span></span>
                    <button onClick={() => deleteItem('groups', g.id)} className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Add Team */}
      {groups.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
            Step 3 — Add Team
          </p>
          <div className="space-y-3">
            <FormField label="Under Group">
              <select className="input" value={teamGrpId} onChange={e => setTeamGrpId(e.target.value)}>
                <option value="">-- Select --</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </FormField>
            <div className="flex gap-2">
              <input type="text" className="input flex-1" value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. Team Alpha" />
              <Button onClick={addTeam} loading={saving} variant="secondary">Add</Button>
            </div>
          </div>
          {teams.length > 0 && (
            <div className="mt-3 space-y-1">
              {teams.map(t => {
                const grp = groups.find(g => g.id === t.group_id)
                return (
                  <div key={t.id} className="flex items-center justify-between py-1.5 px-3 bg-zinc-800 rounded-lg">
                    <span className="text-sm text-zinc-200">{t.name} <span className="text-zinc-500 text-xs">→ {grp?.name}</span></span>
                    <button onClick={() => deleteItem('teams', t.id)} className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Assign Personnel */}
      {teams.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
            Step 4 — Assign Personnel
          </p>
          <div className="space-y-3">
            <FormField label="Member">
              <select className="input" value={assignUser} onChange={e => {
                setAssignUser(e.target.value)
                const p = profiles.find(p => p.id === e.target.value)
                if (p) { setAssignAgency(p.default_agency ?? ''); setAssignUnit(p.default_unit ?? '') }
              }}>
                <option value="">-- Select member --</option>
                {unassignedProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                ))}
              </select>
            </FormField>

            <FormField label="Team">
              <select className="input" value={assignTeam} onChange={e => setAssignTeam(e.target.value)}>
                <option value="">-- Select team --</option>
                {teams.map(t => {
                  const grp = groups.find(g => g.id === t.group_id)
                  const div = divisions.find(d => d.id === grp?.division_id)
                  return <option key={t.id} value={t.id}>{t.name} ({grp?.name} → {div?.name})</option>
                })}
              </select>
            </FormField>

            <FormField label="ICS Position">
              <select className="input" value={assignPosition} onChange={e => setAssignPosition(e.target.value)}>
                <option value="">-- Select position --</option>
                {positionSections.map(section => (
                  <optgroup key={section} label={section}>
                    {ICS_POSITIONS.filter(p => p.section === section).map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Home Agency *">
                <input type="text" className="input" value={assignAgency}
                  onChange={e => setAssignAgency(e.target.value)} />
              </FormField>
              <FormField label="Unit">
                <input type="text" className="input" value={assignUnit}
                  onChange={e => setAssignUnit(e.target.value)} />
              </FormField>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button onClick={addAssignment} loading={saving} className="w-full">
              Assign to Team
            </Button>
          </div>

          {/* Current assignments */}
          {assignments.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
                Assigned ({assignments.length})
              </p>
              {assignments.map(a => {
                const p = profileMap[a.user_id]
                const team = teams.find(t => t.id === a.team_id)
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-zinc-800 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                      {getInitials(p?.full_name ?? '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{p?.full_name}</p>
                      <p className="text-xs text-zinc-500">
                        {getPositionLabel(a.ics_position)} · {team?.name}
                      </p>
                    </div>
                    <button onClick={() => deleteItem('assignments', a.id)}
                      className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <Link href={`/events/${eventId}`} className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Back to Event
        </Link>
        <Link href={`/events/${eventId}`}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors">
          Done
        </Link>
      </div>
    </div>
  )
}