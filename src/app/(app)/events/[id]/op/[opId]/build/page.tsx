'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { HomeButton } from '@/components/ui/HomeButton'
import { getInitials } from '@/lib/utils'
import {
  COMMAND_STAFF_POSITIONS,
  OPERATIONS_POSITIONS,
  PLANNING_POSITIONS,
  LOGISTICS_POSITIONS,
  FINANCE_POSITIONS,
  getPositionLabel,
} from '@/lib/ics-positions'
import Link from 'next/link'

type SectionTab = 'command' | 'agency' | 'ops' | 'planning' | 'logistics' | 'finance'

const TABS: { key: SectionTab; label: string }[] = [
  { key: 'command', label: 'Command Staff' },
  { key: 'agency', label: 'Agency Reps' },
  { key: 'ops', label: 'Operations' },
  { key: 'planning', label: 'Planning' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'finance', label: 'Finance' },
]

export default function BuildOrgPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<SectionTab>('command')
  const [profiles, setProfiles] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<any>({})
  const [assignments, setAssignments] = useState<any[]>([])
  const [divisions, setDivisions] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline team-to-group assignment
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editingTeamGrpId, setEditingTeamGrpId] = useState('')

  // Command staff
  const [cmdPosition, setCmdPosition] = useState('')
  const [cmdSearch, setCmdSearch] = useState('')
  const [cmdResults, setCmdResults] = useState<any[]>([])
  const [cmdSelected, setCmdSelected] = useState<any>(null)

  // Agency reps
  const [agencyName, setAgencyName] = useState('')
  const [agencyOrg, setAgencyOrg] = useState('')

  // Ops
  const [grpName, setGrpName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamGrpId, setTeamGrpId] = useState('')
  const [divName, setDivName] = useState('')
  const [divType, setDivType] = useState<'division' | 'branch'>('division')
  const [assignDivTarget, setAssignDivTarget] = useState('')
  const [assignDivType, setAssignDivType] = useState<'group' | 'team'>('group')
  const [assignDivItemId, setAssignDivItemId] = useState('')

  // Personnel assignment
  const [assignSearch, setAssignSearch] = useState('')
  const [assignResults, setAssignResults] = useState<any[]>([])
  const [assignSelected, setAssignSelected] = useState<any>(null)
  const [assignPosition, setAssignPosition] = useState('')
  const [assignTeam, setAssignTeam] = useState('')
  const [assignAgency, setAssignAgency] = useState('')
  const [assignUnit, setAssignUnit] = useState('')
  const [isManual, setIsManual] = useState(false)
  const [manualName, setManualName] = useState('')

  // Create profile
  const [showCreateProfile, setShowCreateProfile] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newAgency, setNewAgency] = useState('')
  const [newRole, setNewRole] = useState('member')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => { load() }, [opId])

  useEffect(() => {
    if (cmdSearch.length < 2) { setCmdResults([]); return }
    const q = cmdSearch.toLowerCase()
    const assignedIds = assignments.map((a: any) => a.user_id)
    setCmdResults(profiles.filter(p =>
      p.full_name.toLowerCase().includes(q) && !assignedIds.includes(p.id)
    ).slice(0, 5))
  }, [cmdSearch, profiles, assignments])

  useEffect(() => {
    if (assignSearch.length < 2) { setAssignResults([]); return }
    const q = assignSearch.toLowerCase()
    const assignedIds = assignments.map((a: any) => a.user_id)
    setAssignResults(profiles.filter(p =>
      p.full_name.toLowerCase().includes(q) && !assignedIds.includes(p.id)
    ).slice(0, 5))
  }, [assignSearch, profiles, assignments])

  async function load() {
    const supabase = createClient()
    const [{ data: opData }, { data: pData }, { data: aData },
      { data: divData }, { data: grpData }, { data: teamData }] = await Promise.all([
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('divisions').select('*').eq('operational_period_id', opId),
      supabase.from('groups').select('*').eq('operational_period_id', opId),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
    ])
    setOp(opData)
    setProfiles(pData ?? [])
    setAssignments(aData ?? [])
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])
    const map = (pData ?? []).reduce((acc: any, p: any) => { acc[p.id] = p; return acc }, {})
    setProfileMap(map)
    setLoading(false)
  }

  async function getCurrentUser() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }

  async function updateTeamGroup(teamId: string, groupId: string) {
    const supabase = createClient()
    await supabase.from('teams').update({ group_id: groupId || null }).eq('id', teamId)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, group_id: groupId || null } : t))
    setEditingTeamId(null)
    setEditingTeamGrpId('')
  }

  async function assignCommandStaff() {
    if (!cmdPosition || !cmdSelected) { setError('Select a position and person'); return }
    setSaving(true); setError(null)
    const supabase = createClient()
    const user = await getCurrentUser()

    let cmdTeam = teams.find(t => t.name === '__command__')
    if (!cmdTeam) {
      const { data: t } = await supabase.from('teams')
        .insert({ operational_period_id: opId, group_id: null, name: '__command__' })
        .select().single()
      if (t) { cmdTeam = t; setTeams(prev => [...prev, t]) }
    }

    const { data, error: err } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: cmdTeam.id,
      user_id: cmdSelected.id,
      ics_position: cmdPosition,
      home_agency: cmdSelected.default_agency ?? '',
      home_unit: cmdSelected.default_unit ?? null,
      assigned_by: user!.id,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => [...prev, data])
    setCmdSelected(null); setCmdSearch(''); setCmdPosition('')
    setSaving(false)
  }

  async function assignAgencyRep() {
    if (!agencyName.trim()) { setError('Enter a name'); return }
    setSaving(true); setError(null)
    const supabase = createClient()
    const user = await getCurrentUser()

    const { data: newId } = await supabase.rpc('admin_create_profile', {
      p_full_name: agencyName.trim(),
      p_email: `agencyrep_${Date.now()}@placeholder.local`,
      p_role: 'member',
      p_agency: agencyOrg || null,
    })

    let cmdTeam = teams.find(t => t.name === '__command__')
    if (!cmdTeam) {
      const { data: t } = await supabase.from('teams')
        .insert({ operational_period_id: opId, group_id: null, name: '__command__' })
        .select().single()
      if (t) { cmdTeam = t; setTeams(prev => [...prev, t]) }
    }

    const { data, error: err } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: cmdTeam.id,
      user_id: newId,
      ics_position: 'agency_representative',
      home_agency: agencyOrg || agencyName,
      assigned_by: user!.id,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    const newP = { id: newId, full_name: agencyName.trim(), default_agency: agencyOrg }
    setProfileMap((prev: any) => ({ ...prev, [newId]: newP }))
    setAssignments(prev => [...prev, data])
    setAgencyName(''); setAgencyOrg('')
    setSaving(false)
  }

  async function addGroup() {
    if (!grpName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('groups')
      .insert({ operational_period_id: opId, division_id: null, name: grpName.trim() })
      .select().single()
    if (data) { setGroups(prev => [...prev, data]); setGrpName('') }
    setSaving(false)
  }

  async function addTeam() {
    if (!teamName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('teams')
      .insert({
        operational_period_id: opId,
        group_id: teamGrpId || null,
        division_id: null,
        name: teamName.trim()
      })
      .select().single()
    if (data) { setTeams(prev => [...prev, data]); setTeamName(''); setTeamGrpId('') }
    setSaving(false)
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

  async function assignToDivision() {
    if (!assignDivTarget || !assignDivItemId) { setError('Select a division and item'); return }
    setSaving(true); setError(null)
    const supabase = createClient()

    if (assignDivType === 'group') {
      await supabase.from('groups').update({ division_id: assignDivTarget }).eq('id', assignDivItemId)
      setGroups(prev => prev.map(g => g.id === assignDivItemId ? { ...g, division_id: assignDivTarget } : g))
    } else {
      await supabase.from('teams').update({ division_id: assignDivTarget }).eq('id', assignDivItemId)
      setTeams(prev => prev.map(t => t.id === assignDivItemId ? { ...t, division_id: assignDivTarget } : t))
    }
    setAssignDivItemId('')
    setSaving(false)
  }

  async function assignPersonnel(positions: any[]) {
    if (!assignTeam || !assignPosition || !assignAgency) {
      setError('Team, position, and agency are required'); return
    }
    if (!assignSelected && !isManual) { setError('Select a person or use manual entry'); return }
    if (isManual && !manualName.trim()) { setError('Enter a name'); return }

    setSaving(true); setError(null)
    const supabase = createClient()
    const user = await getCurrentUser()
    let userId = assignSelected?.id

    if (isManual) {
      const { data: newId } = await supabase.rpc('admin_create_profile', {
        p_full_name: manualName.trim(),
        p_email: `manual_${Date.now()}@placeholder.local`,
        p_role: 'member',
        p_agency: assignAgency || null,
      })
      if (!newId) { setError('Failed to create entry'); setSaving(false); return }
      userId = newId
      const newP = { id: newId, full_name: manualName.trim(), default_agency: assignAgency }
      setProfileMap((prev: any) => ({ ...prev, [newId]: newP }))
    }

    const { data, error: err } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: assignTeam,
      user_id: userId,
      ics_position: assignPosition,
      home_agency: assignAgency,
      home_unit: assignUnit || null,
      assigned_by: user!.id,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => [...prev, data])
    setAssignSelected(null); setAssignSearch(''); setManualName('')
    setAssignPosition(''); setIsManual(false)
    setSaving(false)
  }

  async function createProfile() {
    if (!newName.trim() || !newEmail.trim()) { setCreateError('Name and email are required'); return }
    setCreatingProfile(true); setCreateError(null)
    const supabase = createClient()

    const { data, error: err } = await supabase.rpc('admin_create_profile', {
      p_full_name: newName.trim(),
      p_email: newEmail.trim(),
      p_role: newRole,
      p_agency: newAgency || null,
    })

    if (err) { setCreateError(err.message); setCreatingProfile(false); return }
    const newP = { id: data, full_name: newName.trim(), email: newEmail.trim(), role: newRole, default_agency: newAgency || null }
    setProfiles(prev => [...prev, newP].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setProfileMap((prev: any) => ({ ...prev, [data]: newP }))
    setNewName(''); setNewEmail(''); setNewAgency(''); setNewRole('member')
    setShowCreateProfile(false); setCreatingProfile(false)
  }

  async function deleteAssignment(id: string) {
    const supabase = createClient()
    await supabase.from('assignments').delete().eq('id', id)
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  async function deleteItem(table: string, id: string) {
    const supabase = createClient()
    await supabase.from(table).delete().eq('id', id)
    if (table === 'groups') setGroups(prev => prev.filter(g => g.id !== id))
    if (table === 'teams') setTeams(prev => prev.filter(t => t.id !== id))
    if (table === 'divisions') setDivisions(prev => prev.filter(d => d.id !== id))
  }

  const sectionAssignments = (tab: SectionTab) => {
    if (tab === 'command') return assignments.filter(a =>
      ['incident_commander','deputy_incident_commander','safety_officer',
       'public_information_officer','liaison_officer'].includes(a.ics_position))
    if (tab === 'agency') return assignments.filter(a => a.ics_position === 'agency_representative')
    if (tab === 'ops') return assignments.filter(a => OPERATIONS_POSITIONS.map(p => p.value).includes(a.ics_position))
    if (tab === 'planning') return assignments.filter(a => PLANNING_POSITIONS.map(p => p.value).includes(a.ics_position))
    if (tab === 'logistics') return assignments.filter(a => LOGISTICS_POSITIONS.map(p => p.value).includes(a.ics_position))
    if (tab === 'finance') return assignments.filter(a => FINANCE_POSITIONS.map(p => p.value).includes(a.ics_position))
    return []
  }

  const opsTeams = teams.filter(t => t.name !== '__command__')

  // Reusable person search block
  const PersonSearch = () => (
    <FormField label="Search Person">
      <div className="relative">
        {!isManual ? (
          <>
            {assignSelected ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 border border-orange-600 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300">
                  {getInitials(assignSelected.full_name)}
                </div>
                <span className="text-sm text-zinc-200 flex-1">{assignSelected.full_name}</span>
                <button onClick={() => { setAssignSelected(null); setAssignSearch('') }}
                  className="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ) : (
              <input type="text" className="input"
                placeholder="Type to search..."
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)} />
            )}
            {assignResults.length > 0 && !assignSelected && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-10">
                {assignResults.map(p => (
                  <button key={p.id}
                    onClick={() => {
                      setAssignSelected(p); setAssignSearch(''); setAssignResults([])
                      setAssignAgency(p.default_agency ?? ''); setAssignUnit(p.default_unit ?? '')
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 text-left">
                    <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                      {getInitials(p.full_name)}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200">{p.full_name}</p>
                      <p className="text-xs text-zinc-500">{p.default_agency ?? p.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <input type="text" className="input" placeholder="Type name manually..."
            value={manualName} onChange={e => setManualName(e.target.value)} />
        )}
      </div>
      <button
        onClick={() => { setIsManual(!isManual); setAssignSelected(null); setAssignSearch(''); setManualName('') }}
        className="text-xs text-zinc-500 hover:text-zinc-300 mt-1">
        {isManual ? '← Search registered members' : 'Enter manually'}
      </button>
    </FormField>
  )

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin — Org Builder</p>
        <h1 className="text-xl font-semibold text-zinc-100">Operational Period {op?.period_number}</h1>
        <p className="text-xs font-mono text-zinc-500 mt-1">
          {new Date(op?.op_period_start).toLocaleString()} — {new Date(op?.op_period_end).toLocaleString()}
        </p>
      </div>

      {/* Section tabs — larger */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {TABS.map(tab => (
          <button key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(null) }}
            className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left ${
              activeTab === tab.key
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}>
            {tab.label}
            <span className="block text-xs mt-0.5 opacity-60">
              {sectionAssignments(tab.key).length} assigned
            </span>
          </button>
        ))}
      </div>

      {/* Create profile */}
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreateProfile(!showCreateProfile)}
          className="text-xs text-orange-500 hover:text-orange-400">
          + Create profile
        </button>
      </div>

      {showCreateProfile && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">New Profile</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Full Name *">
              <input type="text" className="input" value={newName} onChange={e => setNewName(e.target.value)} />
            </FormField>
            <FormField label="Email *">
              <input type="email" className="input" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </FormField>
            <FormField label="Agency">
              <input type="text" className="input" value={newAgency} onChange={e => setNewAgency(e.target.value)} />
            </FormField>
            <FormField label="Role">
              <select className="input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </FormField>
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <div className="flex gap-2">
            <Button onClick={createProfile} loading={creatingProfile} variant="secondary">Create Profile</Button>
            <button onClick={() => setShowCreateProfile(false)} className="text-xs text-zinc-500 hover:text-zinc-300 px-3">Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {/* ═══ COMMAND STAFF ═══ */}
      {activeTab === 'command' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Command Staff</p>
          <FormField label="Position">
            <select className="input" value={cmdPosition} onChange={e => setCmdPosition(e.target.value)}>
              <option value="">-- Select position --</option>
              {COMMAND_STAFF_POSITIONS.filter(p => p.value !== 'agency_representative').map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Person">
            <div className="relative">
              {cmdSelected ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 border border-orange-600 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300">
                    {getInitials(cmdSelected.full_name)}
                  </div>
                  <span className="text-sm text-zinc-200 flex-1">{cmdSelected.full_name}</span>
                  <button onClick={() => { setCmdSelected(null); setCmdSearch('') }}
                    className="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>
                </div>
              ) : (
                <input type="text" className="input" placeholder="Search by name..."
                  value={cmdSearch} onChange={e => setCmdSearch(e.target.value)} />
              )}
              {cmdResults.length > 0 && !cmdSelected && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-10">
                  {cmdResults.map(p => (
                    <button key={p.id}
                      onClick={() => { setCmdSelected(p); setCmdSearch(''); setCmdResults([]) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 text-left">
                      <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                        {getInitials(p.full_name)}
                      </div>
                      <div>
                        <p className="text-sm text-zinc-200">{p.full_name}</p>
                        <p className="text-xs text-zinc-500">{p.default_agency ?? p.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FormField>

          <Button onClick={assignCommandStaff} loading={saving} className="w-full">
            Assign to Command Staff
          </Button>

          {sectionAssignments('command').length > 0 && (
            <div className="space-y-2 border-t border-zinc-800 pt-4">
              {sectionAssignments('command').map(a => {
                const p = profileMap[a.user_id]
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-zinc-800 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                      {getInitials(p?.full_name ?? '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-zinc-500">{getPositionLabel(a.ics_position)}</p>
                    </div>
                    <button onClick={() => deleteAssignment(a.id)}
                      className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ AGENCY REPS ═══ */}
      {activeTab === 'agency' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Agency / Organization Representatives</p>
          <FormField label="Representative Name *">
            <input type="text" className="input" value={agencyName}
              placeholder="e.g. John Smith" onChange={e => setAgencyName(e.target.value)} />
          </FormField>
          <FormField label="Agency / Organization">
            <input type="text" className="input" value={agencyOrg}
              placeholder="e.g. Michigan State Police" onChange={e => setAgencyOrg(e.target.value)} />
          </FormField>
          <Button onClick={assignAgencyRep} loading={saving} className="w-full">
            Add Representative
          </Button>
          {sectionAssignments('agency').length > 0 && (
            <div className="space-y-2 border-t border-zinc-800 pt-4">
              {sectionAssignments('agency').map(a => {
                const p = profileMap[a.user_id]
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-zinc-800 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                      {getInitials(p?.full_name ?? '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-zinc-500">{a.home_agency}</p>
                    </div>
                    <button onClick={() => deleteAssignment(a.id)}
                      className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ OPERATIONS ═══ */}
      {activeTab === 'ops' && (
        <div className="space-y-4">
          {/* Groups */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Step 1 — Create Groups</p>
            <div className="flex gap-2">
              <input type="text" className="input flex-1" value={grpName}
                onChange={e => setGrpName(e.target.value)} placeholder="e.g. Search Group" />
              <Button onClick={addGroup} loading={saving} variant="secondary">Add</Button>
            </div>
            {groups.length > 0 && (
              <div className="mt-3 space-y-1">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center justify-between py-1.5 px-3 bg-zinc-800 rounded-lg">
                    <span className="text-sm text-zinc-200">{g.name}
                      {g.division_id && <span className="text-zinc-500 text-xs ml-2">→ {divisions.find(d => d.id === g.division_id)?.name}</span>}
                    </span>
                    <button onClick={() => deleteItem('groups', g.id)}
                      className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Teams — clickable to assign to group */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Step 2 — Create Teams</p>
            <div className="space-y-3">
              <FormField label="Place in Group (optional)">
                <select className="input" value={teamGrpId} onChange={e => setTeamGrpId(e.target.value)}>
                  <option value="">-- No group yet --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </FormField>
              <div className="flex gap-2">
                <input type="text" className="input flex-1" value={teamName}
                  onChange={e => setTeamName(e.target.value)} placeholder="e.g. Team Alpha" />
                <Button onClick={addTeam} loading={saving} variant="secondary">Add</Button>
              </div>
            </div>
            {opsTeams.length > 0 && (
              <div className="mt-3 space-y-2">
                {opsTeams.map(t => {
                  const grp = groups.find(g => g.id === t.group_id)
                  const div = divisions.find(d => d.id === t.division_id)
                  const isEditing = editingTeamId === t.id
                  return (
                    <div key={t.id} className="bg-zinc-800 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between py-1.5 px-3">
                        <button
                          onClick={() => {
                            setEditingTeamId(isEditing ? null : t.id)
                            setEditingTeamGrpId(t.group_id ?? '')
                          }}
                          className="text-sm text-zinc-200 text-left flex-1 hover:text-orange-400 transition-colors"
                        >
                          {t.name}
                          {grp && <span className="text-zinc-500 text-xs ml-2">→ {grp.name}</span>}
                          {div && <span className="text-zinc-500 text-xs ml-2">→ {div.name}</span>}
                          <span className="text-zinc-600 text-xs ml-2">(click to edit group)</span>
                        </button>
                        <button onClick={() => deleteItem('teams', t.id)}
                          className="text-zinc-600 hover:text-red-400 text-lg leading-none ml-2">×</button>
                      </div>
                      {isEditing && (
                        <div className="px-3 pb-3 pt-1 border-t border-zinc-700 space-y-2">
                          <select className="input text-sm" value={editingTeamGrpId}
                            onChange={e => setEditingTeamGrpId(e.target.value)}>
                            <option value="">-- No group --</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <Button onClick={() => updateTeamGroup(t.id, editingTeamGrpId)}
                              loading={saving} variant="secondary" className="flex-1 text-xs py-1.5">
                              Save
                            </Button>
                            <button onClick={() => setEditingTeamId(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-300 px-3">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Divisions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Step 3 — Create Division or Branch (optional)</p>
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
                    <button onClick={() => deleteItem('divisions', d.id)}
                      className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assign to Division */}
          {divisions.length > 0 && (groups.length > 0 || opsTeams.length > 0) && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Step 4 — Place into Division or Branch</p>
              <div className="space-y-3">
                <FormField label="Division / Branch">
                  <select className="input" value={assignDivTarget} onChange={e => setAssignDivTarget(e.target.value)}>
                    <option value="">-- Select --</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
                  </select>
                </FormField>
                <div className="flex gap-2">
                  <button onClick={() => setAssignDivType('group')}
                    className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${assignDivType === 'group' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                    Group
                  </button>
                  <button onClick={() => setAssignDivType('team')}
                    className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${assignDivType === 'team' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                    Team
                  </button>
                </div>
                <FormField label={assignDivType === 'group' ? 'Select Group' : 'Select Team'}>
                  <select className="input" value={assignDivItemId} onChange={e => setAssignDivItemId(e.target.value)}>
                    <option value="">-- Select --</option>
                    {assignDivType === 'group'
                      ? groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                      : opsTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                    }
                  </select>
                </FormField>
                <Button onClick={assignToDivision} loading={saving} variant="secondary" className="w-full">
                  Place into Division/Branch
                </Button>
              </div>
            </div>
          )}

          {/* Assign Personnel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Step 5 — Assign Personnel</p>
            <PersonSearch />
            <FormField label="Team *">
              <select className="input" value={assignTeam} onChange={e => setAssignTeam(e.target.value)}>
                <option value="">-- Select team --</option>
                {opsTeams.map(t => {
                  const grp = groups.find(g => g.id === t.group_id)
                  const div = divisions.find(d => d.id === t.division_id || d.id === groups.find(g => g.id === t.group_id)?.division_id)
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name}{grp ? ` (${grp.name})` : ''}{div ? ` → ${div.name}` : ''}
                    </option>
                  )
                })}
              </select>
            </FormField>
            <FormField label="ICS Position *">
              <select className="input" value={assignPosition} onChange={e => setAssignPosition(e.target.value)}>
                <option value="">-- Select position --</option>
                {OPERATIONS_POSITIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Home Agency *">
                <input type="text" className="input" value={assignAgency} onChange={e => setAssignAgency(e.target.value)} />
              </FormField>
              <FormField label="Unit">
                <input type="text" className="input" value={assignUnit} onChange={e => setAssignUnit(e.target.value)} />
              </FormField>
            </div>
            <Button onClick={() => assignPersonnel(OPERATIONS_POSITIONS)} loading={saving} className="w-full">
              Assign to Operations
            </Button>
            {sectionAssignments('ops').length > 0 && (
              <div className="space-y-2 border-t border-zinc-800 pt-4">
                {sectionAssignments('ops').map(a => {
                  const p = profileMap[a.user_id]
                  const team = opsTeams.find(t => t.id === a.team_id)
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-zinc-800 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                        {getInitials(p?.full_name ?? '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-zinc-500">{getPositionLabel(a.ics_position)} · {team?.name}</p>
                      </div>
                      <button onClick={() => deleteAssignment(a.id)}
                        className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ PLANNING / LOGISTICS / FINANCE ═══ */}
      {(['planning', 'logistics', 'finance'] as SectionTab[]).includes(activeTab) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
            {activeTab === 'planning' ? 'Planning Section' : activeTab === 'logistics' ? 'Logistics Section' : 'Finance / Admin Section'}
          </p>
          <PersonSearch />
          <FormField label="Team *">
            <select className="input" value={assignTeam} onChange={e => setAssignTeam(e.target.value)}>
              <option value="">-- Select team --</option>
              {opsTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>
          <FormField label="ICS Position *">
            <select className="input" value={assignPosition} onChange={e => setAssignPosition(e.target.value)}>
              <option value="">-- Select position --</option>
              {(activeTab === 'planning' ? PLANNING_POSITIONS : activeTab === 'logistics' ? LOGISTICS_POSITIONS : FINANCE_POSITIONS).map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Home Agency *">
              <input type="text" className="input" value={assignAgency} onChange={e => setAssignAgency(e.target.value)} />
            </FormField>
            <FormField label="Unit">
              <input type="text" className="input" value={assignUnit} onChange={e => setAssignUnit(e.target.value)} />
            </FormField>
          </div>
          <Button
            onClick={() => assignPersonnel(
              activeTab === 'planning' ? PLANNING_POSITIONS :
              activeTab === 'logistics' ? LOGISTICS_POSITIONS : FINANCE_POSITIONS
            )}
            loading={saving} className="w-full">
            Assign to {activeTab === 'planning' ? 'Planning' : activeTab === 'logistics' ? 'Logistics' : 'Finance'}
          </Button>
          {sectionAssignments(activeTab).length > 0 && (
            <div className="space-y-2 border-t border-zinc-800 pt-4">
              {sectionAssignments(activeTab).map(a => {
                const p = profileMap[a.user_id]
                const team = opsTeams.find(t => t.id === a.team_id)
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-zinc-800 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                      {getInitials(p?.full_name ?? '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-zinc-500">{getPositionLabel(a.ics_position)} · {team?.name}</p>
                    </div>
                    <button onClick={() => deleteAssignment(a.id)}
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