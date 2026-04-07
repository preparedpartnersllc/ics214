'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [teamName, setTeamName] = useState('')
  const [teamGrpId, setTeamGrpId] = useState('')
  const [grpName, setGrpName] = useState('')
  const [grpDivId, setGrpDivId] = useState('')
  const [divName, setDivName] = useState('')
  const [divType, setDivType] = useState<'division' | 'branch'>('division')

  const [assignTeam, setAssignTeam] = useState('')
  const [assignPosition, setAssignPosition] = useState('')
  const [assignAgency, setAssignAgency] = useState('')
  const [assignUnit, setAssignUnit] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [isManual, setIsManual] = useState(false)
  const [manualName, setManualName] = useState('')

  const [showCreateProfile, setShowCreateProfile] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newAgency, setNewAgency] = useState('')
  const [newRole, setNewRole] = useState('member')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const positionSections = [...new Set(ICS_POSITIONS.map(p => p.section))]

  useEffect(() => { load() }, [opId])

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const q = searchQuery.toLowerCase()
    setSearchResults(
      profiles.filter(p =>
        p.full_name.toLowerCase().includes(q) &&
        !assignments.find((a: any) => a.user_id === p.id)
      ).slice(0, 5)
    )
  }, [searchQuery, profiles, assignments])

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

  async function addTeam() {
    if (!teamName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('teams')
      .insert({
        operational_period_id: opId,
        group_id: teamGrpId || null,
        name: teamName.trim()
      })
      .select().single()
    if (data) { setTeams(prev => [...prev, data]); setTeamName(''); setTeamGrpId('') }
    setSaving(false)
  }

  async function addGroup() {
    if (!grpName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('groups')
      .insert({
        operational_period_id: opId,
        division_id: grpDivId || null,
        name: grpName.trim()
      })
      .select().single()
    if (data) { setGroups(prev => [...prev, data]); setGrpName(''); setGrpDivId('') }
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

  async function addAssignment() {
    if (!assignTeam || !assignPosition || !assignAgency) {
      setError('Team, position, and agency are required'); return
    }
    if (!selectedUser && !isManual) {
      setError('Select a person or use manual entry'); return
    }
    if (isManual && !manualName.trim()) {
      setError('Enter a name for the manual entry'); return
    }

    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let userId = selectedUser?.id

    if (isManual) {
      const { data: newId, error: rpcErr } = await supabase.rpc('admin_create_profile', {
        p_full_name: manualName.trim(),
        p_email: `manual_${Date.now()}@placeholder.local`,
        p_role: 'member',
        p_agency: assignAgency || null,
      })
      if (rpcErr || !newId) { setError(rpcErr?.message ?? 'Failed to create manual entry'); setSaving(false); return }
      userId = newId
      const newP = { id: newId, full_name: manualName.trim(), email: '', role: 'member', default_agency: assignAgency }
      setProfileMap((prev: any) => ({ ...prev, [newId]: newP }))
    }

    const { data, error: err } = await supabase.from('assignments')
      .insert({
        operational_period_id: opId,
        team_id: assignTeam,
        user_id: userId,
        ics_position: assignPosition,
        home_agency: assignAgency,
        home_unit: assignUnit || null,
        assigned_by: user!.id,
      })
      .select().single()

    if (err) { setError(err.message); setSaving(false); return }
    if (data) {
      setAssignments(prev => [...prev, data])
      setSelectedUser(null)
      setSearchQuery('')
      setManualName('')
      setAssignPosition('')
      setIsManual(false)
    }
    setSaving(false)
  }

  async function createProfile() {
    if (!newName.trim() || !newEmail.trim()) {
      setCreateError('Name and email are required'); return
    }
    setCreatingProfile(true)
    setCreateError(null)
    const supabase = createClient()

    const { data, error: err } = await supabase.rpc('admin_create_profile', {
      p_full_name: newName.trim(),
      p_email: newEmail.trim(),
      p_role: newRole,
      p_agency: newAgency || null,
    })

    if (err) { setCreateError(err.message); setCreatingProfile(false); return }

    const newP = {
      id: data,
      full_name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
      default_agency: newAgency || null
    }
    setProfiles(prev => [...prev, newP].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setProfileMap((prev: any) => ({ ...prev, [data]: newP }))
    setNewName(''); setNewEmail(''); setNewAgency(''); setNewRole('member')
    setShowCreateProfile(false)
    setCreatingProfile(false)
  }

  async function deleteItem(table: string, id: string) {
    const supabase = createClient()
    await supabase.from(table).delete().eq('id', id)
    if (table === 'divisions') setDivisions(prev => prev.filter(d => d.id !== id))
    if (table === 'groups') setGroups(prev => prev.filter(g => g.id !== id))
    if (table === 'teams') setTeams(prev => prev.filter(t => t.id !== id))
    if (table === 'assignments') setAssignments(prev => prev.filter(a => a.id !== id))
  }

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

      {/* Step 1: Create Team */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
          Step 1 — Create Team
        </p>
        <div className="space-y-3">
          <FormField label="Place in Group (optional)">
            <select className="input" value={teamGrpId} onChange={e => setTeamGrpId(e.target.value)}>
              <option value="">-- No group yet --</option>
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
                  <span className="text-sm text-zinc-200">
                    {t.name}
                    {grp && <span className="text-zinc-500 text-xs ml-2">→ {grp.name}</span>}
                  </span>
                  <button onClick={() => deleteItem('teams', t.id)}
                    className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Step 2: Create Group */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
          Step 2 — Create Group (optional)
        </p>
        <div className="space-y-3">
          <FormField label="Place in Division/Branch (optional)">
            <select className="input" value={grpDivId} onChange={e => setGrpDivId(e.target.value)}>
              <option value="">-- No division yet --</option>
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
                  <span className="text-sm text-zinc-200">
                    {g.name}
                    {div && <span className="text-zinc-500 text-xs ml-2">→ {div.name}</span>}
                  </span>
                  <button onClick={() => deleteItem('groups', g.id)}
                    className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Step 3: Create Division/Branch */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
          Step 3 — Create Division or Branch (optional)
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
                <button onClick={() => deleteItem('divisions', d.id)}
                  className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 4: Assign Personnel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
            Step 4 — Assign Personnel
          </p>
          <button
            onClick={() => setShowCreateProfile(!showCreateProfile)}
            className="text-xs text-orange-500 hover:text-orange-400">
            + Create profile
          </button>
        </div>

        {showCreateProfile && (
          <div className="bg-zinc-800 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">New Profile</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Full Name *">
                <input type="text" className="input" value={newName}
                  onChange={e => setNewName(e.target.value)} />
              </FormField>
              <FormField label="Email *">
                <input type="email" className="input" value={newEmail}
                  onChange={e => setNewEmail(e.target.value)} />
              </FormField>
              <FormField label="Agency">
                <input type="text" className="input" value={newAgency}
                  onChange={e => setNewAgency(e.target.value)} />
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
              <Button onClick={createProfile} loading={creatingProfile} variant="secondary">
                Create Profile
              </Button>
              <button onClick={() => setShowCreateProfile(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-3">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <FormField label="Search Person">
            <div className="relative">
              {!isManual ? (
                <>
                  {selectedUser ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 border border-orange-600 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300">
                        {getInitials(selectedUser.full_name)}
                      </div>
                      <span className="text-sm text-zinc-200 flex-1">{selectedUser.full_name}</span>
                      <button onClick={() => { setSelectedUser(null); setSearchQuery('') }}
                        className="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="input"
                      placeholder="Type to search registered members..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  )}
                  {searchResults.length > 0 && !selectedUser && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-10">
                      {searchResults.map(p => (
                        <button key={p.id}
                          onClick={() => {
                            setSelectedUser(p)
                            setSearchQuery('')
                            setSearchResults([])
                            setAssignAgency(p.default_agency ?? '')
                            setAssignUnit(p.default_unit ?? '')
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 transition-colors text-left">
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
                <input type="text" className="input"
                  placeholder="Type name manually (Agency/Org Rep)"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)} />
              )}
            </div>
            <button
              onClick={() => { setIsManual(!isManual); setSelectedUser(null); setSearchQuery(''); setManualName('') }}
              className="text-xs text-zinc-500 hover:text-zinc-300 mt-1">
              {isManual ? '← Search registered members' : 'Enter manually (Agency/Org Rep)'}
            </button>
          </FormField>

          <FormField label="Team *">
            <select className="input" value={assignTeam} onChange={e => setAssignTeam(e.target.value)}>
              <option value="">-- Select team --</option>
              {teams.map(t => {
                const grp = groups.find(g => g.id === t.group_id)
                const div = divisions.find(d => d.id === grp?.division_id)
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}{grp ? ` (${grp.name}${div ? ` → ${div.name}` : ''})` : ''}
                  </option>
                )
              })}
            </select>
          </FormField>

          <FormField label="ICS Position *">
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
                    <p className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
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