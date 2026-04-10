'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
type UnitType = 'branch' | 'division' | 'group' | 'team'

const TABS: { key: SectionTab; label: string }[] = [
  { key: 'command', label: 'Command Staff' },
  { key: 'agency', label: 'Agency Reps' },
  { key: 'ops', label: 'Operations' },
  { key: 'planning', label: 'Planning' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'finance', label: 'Finance' },
]

// Unit type → canonical leader position
const LEADER_POSITION: Record<UnitType, string> = {
  branch: 'branch_director',
  division: 'division_supervisor',
  group: 'group_supervisor',
  team: 'team_leader',
}

// System team name helpers
const sysName = (type: UnitType, id: string) =>
  type === 'branch' ? `__br_${id}__`
  : type === 'division' ? `__dv_${id}__`
  : type === 'group' ? `__gr_${id}__`
  : null

export default function BuildOrgPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<SectionTab>('command')
  const [profiles, setProfiles] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, any>>({})
  const [assignments, setAssignments] = useState<any[]>([])
  const [divisions, setDivisions] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [dualHatRules, setDualHatRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Command staff form ───────────────────────────────────────
  const [cmdPosition, setCmdPosition] = useState('')
  const [cmdSearch, setCmdSearch] = useState('')
  const [cmdResults, setCmdResults] = useState<any[]>([])
  const [cmdSelected, setCmdSelected] = useState<any>(null)

  // ─── Agency rep form ──────────────────────────────────────────
  const [agencyName, setAgencyName] = useState('')
  const [agencyOrg, setAgencyOrg] = useState('')

  // ─── Shared person search (ops + sections) ────────────────────
  const [assignSearch, setAssignSearch] = useState('')
  const [assignResults, setAssignResults] = useState<any[]>([])
  const [assignSelected, setAssignSelected] = useState<any>(null)
  const [assignPosition, setAssignPosition] = useState('')
  const [assignAgency, setAssignAgency] = useState('')
  const [assignUnit, setAssignUnit] = useState('')
  const [isManual, setIsManual] = useState(false)
  const [manualName, setManualName] = useState('')

  // ─── Ops tab state ────────────────────────────────────────────
  // What we're currently assigning to (leader or member)
  const [assignTarget, setAssignTarget] = useState<{
    type: UnitType | 'member'
    unitId: string
    label: string
  } | null>(null)

  // Inline "add child" form
  const [addChildFor, setAddChildFor] = useState<{
    parentType: 'branch' | 'division' | 'group'
    parentId: string
    childType: 'group' | 'team'
  } | null>(null)
  const [newChildName, setNewChildName] = useState('')

  // Top-level create
  const [newTopName, setNewTopName] = useState('')
  const [newTopType, setNewTopType] = useState<'branch' | 'division' | 'group' | 'team'>('branch')

  // Move item
  const [movingItem, setMovingItem] = useState<{ type: 'group' | 'team'; id: string } | null>(null)
  const [moveTargetId, setMoveTargetId] = useState('')

  // Dual hat admin panel
  const [showDualHatPanel, setShowDualHatPanel] = useState(false)

  // ─── Drag-and-drop state ──────────────────────────────────────
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null)
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null)

  // ─── Profile creation ─────────────────────────────────────────
  const [showCreateProfile, setShowCreateProfile] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newAgency, setNewAgency] = useState('')
  const [newRole, setNewRole] = useState('member')
  const [newNotes, setNewNotes] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // ─── Derived / memoised ───────────────────────────────────────
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

  const opsTeams = useMemo(
    () => teams.filter(t => !t.name.startsWith('__')),
    [teams]
  )

  const branches = useMemo(() => divisions.filter(d => d.type === 'branch'), [divisions])
  const divs    = useMemo(() => divisions.filter(d => d.type === 'division'), [divisions])

  // ─── Leader/member helpers ────────────────────────────────────
  function getUnitLeader(type: UnitType, id: string) {
    if (type === 'team') {
      return (assignmentsByTeamId[id] ?? []).find(
        (a: any) => a.ics_position === 'team_leader'
      ) ?? null
    }
    const tId = sysTeamIdMap[sysName(type, id)!]
    if (!tId) return null
    return (assignmentsByTeamId[tId] ?? [])[0] ?? null
  }

  function getTeamMembers(teamId: string) {
    return (assignmentsByTeamId[teamId] ?? []).filter(
      (a: any) => a.ics_position !== 'team_leader'
    )
  }

  // ─── Effects ──────────────────────────────────────────────────
  useEffect(() => { load() }, [opId])

  // Command staff search
  useEffect(() => {
    if (cmdSearch.length < 2) { setCmdResults([]); return }
    const q = cmdSearch.toLowerCase()
    setCmdResults(profiles.filter(p => p.full_name.toLowerCase().includes(q)).slice(0, 5))
  }, [cmdSearch, profiles])

  // General person search (ops + sections) — shows everyone (dual-hat handled at assignment)
  useEffect(() => {
    if (assignSearch.length < 2) { setAssignResults([]); return }
    const q = assignSearch.toLowerCase()
    setCmdResults([])
    setAssignResults(profiles.filter(p => p.full_name.toLowerCase().includes(q)).slice(0, 6))
  }, [assignSearch, profiles])

  // ─── Data load ────────────────────────────────────────────────
  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: opData }, { data: pData }, { data: me }, { data: aData },
      { data: divData }, { data: grpData }, { data: teamData }, { data: rulesData }] =
      await Promise.all([
        supabase.from('operational_periods').select('*').eq('id', opId).single(),
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('profiles').select('*').eq('id', user!.id).single(),
        supabase.from('assignments').select('*').eq('operational_period_id', opId),
        supabase.from('divisions').select('*').eq('operational_period_id', opId),
        supabase.from('groups').select('*').eq('operational_period_id', opId),
        supabase.from('teams').select('*').eq('operational_period_id', opId),
        supabase.from('dual_hat_rules').select('*').eq('event_id', eventId),
      ])

    setOp(opData)
    setProfile(me)
    setProfiles(pData ?? [])
    setAssignments(aData ?? [])
    setDivisions(divData ?? [])
    setGroups(grpData ?? [])
    setTeams(teamData ?? [])

    const map = (pData ?? []).reduce((acc: any, p: any) => {
      acc[p.id] = p; return acc
    }, {})
    setProfileMap(map)

    // Seed default dual-hat rule for this event if none exist
    let rules = rulesData ?? []
    if (rules.length === 0) {
      const { data: newRule } = await supabase.from('dual_hat_rules').insert({
        event_id: eventId,
        role1: 'group_supervisor',
        role2: 'team_leader',
        label: 'Group Supervisor can also serve as Team Leader',
        enabled: true,
      }).select().single()
      if (newRule) rules = [newRule]
    }
    setDualHatRules(rules)
    setLoading(false)
  }

  async function getCurrentUser() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }

  function clearAssignForm() {
    setAssignSelected(null); setAssignSearch(''); setManualName('')
    setAssignPosition(''); setAssignAgency(''); setAssignUnit('')
    setIsManual(false); setAssignTarget(null)
  }

  // ─── System team helper ───────────────────────────────────────
  async function ensureSysTeam(
    name: string,
    groupId: string | null,
    divisionId: string | null
  ): Promise<any | null> {
    if (sysTeamIdMap[name]) {
      return { id: sysTeamIdMap[name], name }
    }
    const supabase = createClient()
    const { data } = await supabase.from('teams').insert({
      operational_period_id: opId,
      group_id: groupId,
      division_id: divisionId,
      name,
    }).select().single()
    if (data) setTeams(prev => [...prev, data])
    return data
  }

  // ─── Duplicate / dual-hat check ───────────────────────────────
  function checkDuplicateAssignment(userId: string, incomingPosition: string): {
    blocked: boolean
    dualHat: boolean
    existingAssignment: any | null
    message: string | null
  } {
    const existing = assignments.filter(a => a.user_id === userId)
    if (existing.length === 0) return { blocked: false, dualHat: false, existingAssignment: null, message: null }

    // Already dual-hatted in two roles
    if (existing.length >= 2) {
      const name = profileMap[userId]?.full_name ?? 'This person'
      return {
        blocked: true, dualHat: false, existingAssignment: existing[0],
        message: `${name} is already assigned to two roles. Remove one first.`,
      }
    }

    const ea = existing[0]
    const isDualHatAllowed = dualHatRules.some(r =>
      r.enabled && (
        (r.role1 === ea.ics_position && r.role2 === incomingPosition) ||
        (r.role2 === ea.ics_position && r.role1 === incomingPosition)
      )
    )

    if (!isDualHatAllowed) {
      const name = profileMap[userId]?.full_name ?? 'This person'
      const existingLabel = getPositionLabel(ea.ics_position)
      return {
        blocked: true, dualHat: false, existingAssignment: ea,
        message: `${name} is already assigned as ${existingLabel}. Remove that assignment first, or choose someone else.`,
      }
    }

    return { blocked: false, dualHat: true, existingAssignment: ea, message: null }
  }

  // ─── Assign unit leader (branch/division/group/team_leader) ───
  async function assignUnitLeader() {
    if (!assignTarget) return
    if (!assignSelected && !isManual) { setError('Select a person'); return }
    if (isManual && !manualName.trim()) { setError('Enter a name'); return }
    if (!assignAgency.trim()) { setError('Home agency is required'); return }

    const { type, unitId } = assignTarget
    if (type === 'member') return // handled separately
    const position = LEADER_POSITION[type as UnitType]

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
      setProfileMap(prev => ({ ...prev, [newId]: { id: newId, full_name: manualName.trim(), default_agency: assignAgency } }))
    }

    const { blocked, dualHat, existingAssignment, message } = checkDuplicateAssignment(userId, position)
    if (blocked) { setError(message!); setSaving(false); return }

    // Mark existing as dual-hatted
    if (dualHat && existingAssignment) {
      await supabase.from('assignments').update({ dual_hatted: true }).eq('id', existingAssignment.id)
      setAssignments(prev => prev.map(a => a.id === existingAssignment.id ? { ...a, dual_hatted: true } : a))
    }

    // Resolve team_id
    let teamId: string
    if (type === 'team') {
      teamId = unitId
    } else {
      const sys = sysName(type as UnitType, unitId)!
      const divisionId = (type === 'branch' || type === 'division') ? unitId : null
      const groupId = type === 'group' ? unitId : null
      const sysTeam = await ensureSysTeam(sys, groupId, divisionId)
      if (!sysTeam) { setError('Failed to create system team'); setSaving(false); return }
      teamId = sysTeam.id
    }

    const { data, error: err } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: teamId,
      user_id: userId,
      ics_position: position,
      home_agency: assignAgency,
      home_unit: assignUnit || null,
      assigned_by: user!.id,
      dual_hatted: dualHat,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => [...prev, data])
    clearAssignForm()
    setSaving(false)
  }

  // ─── Assign team member ───────────────────────────────────────
  async function assignTeamMember() {
    if (!assignTarget || assignTarget.type !== 'member') return
    if (!assignSelected && !isManual) { setError('Select a person'); return }
    if (isManual && !manualName.trim()) { setError('Enter a name'); return }
    if (!assignAgency.trim()) { setError('Home agency is required'); return }
    if (!assignPosition) { setError('Select a position'); return }

    const teamId = assignTarget.unitId
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
      setProfileMap(prev => ({ ...prev, [newId]: { id: newId, full_name: manualName.trim(), default_agency: assignAgency } }))
    }

    const { blocked, dualHat, existingAssignment, message } = checkDuplicateAssignment(userId, assignPosition)
    if (blocked) { setError(message!); setSaving(false); return }

    if (dualHat && existingAssignment) {
      await supabase.from('assignments').update({ dual_hatted: true }).eq('id', existingAssignment.id)
      setAssignments(prev => prev.map(a => a.id === existingAssignment.id ? { ...a, dual_hatted: true } : a))
    }

    const { data, error: err } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: teamId,
      user_id: userId,
      ics_position: assignPosition,
      home_agency: assignAgency,
      home_unit: assignUnit || null,
      assigned_by: user!.id,
      dual_hatted: dualHat,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => [...prev, data])
    clearAssignForm()
    setSaving(false)
  }

  // ─── Remove assignment (handles dual-hat cleanup) ─────────────
  async function deleteAssignment(id: string) {
    const supabase = createClient()
    const removing = assignments.find(a => a.id === id)
    await supabase.from('assignments').delete().eq('id', id)
    setAssignments(prev => prev.filter(a => a.id !== id))

    // If this was a dual-hatted assignment, un-flag the partner
    if (removing?.dual_hatted) {
      const partner = assignments.find(
        a => a.id !== id && a.user_id === removing.user_id && a.dual_hatted
      )
      if (partner) {
        await supabase.from('assignments').update({ dual_hatted: false }).eq('id', partner.id)
        setAssignments(prev => prev.map(a => a.id === partner.id ? { ...a, dual_hatted: false } : a))
      }
    }
  }

  // ─── Drag-and-drop reassign ───────────────────────────────────
  async function reassignPersonToTeam(assignmentId: string, targetTeamId: string) {
    const assignment = assignments.find(a => a.id === assignmentId)
    if (!assignment || assignment.team_id === targetTeamId) return

    // If the person is a team leader, ensure the new team doesn't already have one
    if (assignment.ics_position === 'team_leader') {
      const existingLeader = (assignmentsByTeamId[targetTeamId] ?? []).find(
        (a: any) => a.ics_position === 'team_leader'
      )
      if (existingLeader) {
        const targetName = teams.find(t => t.id === targetTeamId)?.name ?? 'That team'
        setError(`${targetName} already has a Team Leader. Remove them first.`)
        return
      }
    }

    setSaving(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('assignments')
      .update({ team_id: targetTeamId })
      .eq('id', assignmentId)

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId ? { ...a, team_id: targetTeamId } : a
    ))
    setSaving(false)
  }

  // ─── Delete division/group/team ───────────────────────────────
  async function deleteItem(table: string, id: string) {
    const supabase = createClient()
    await supabase.from(table).delete().eq('id', id)
    if (table === 'groups') setGroups(prev => prev.filter(g => g.id !== id))
    if (table === 'teams') setTeams(prev => prev.filter(t => t.id !== id))
    if (table === 'divisions') setDivisions(prev => prev.filter(d => d.id !== id))
  }

  // ─── Create top-level unit ────────────────────────────────────
  async function createTopLevel() {
    if (!newTopName.trim()) return
    setSaving(true); setError(null)
    const supabase = createClient()
    if (newTopType === 'branch' || newTopType === 'division') {
      const { data } = await supabase.from('divisions').insert({
        operational_period_id: opId,
        name: newTopName.trim(),
        type: newTopType,
      }).select().single()
      if (data) setDivisions(prev => [...prev, data])
    } else if (newTopType === 'group') {
      const { data } = await supabase.from('groups').insert({
        operational_period_id: opId, division_id: null, name: newTopName.trim(),
      }).select().single()
      if (data) setGroups(prev => [...prev, data])
    } else {
      const { data } = await supabase.from('teams').insert({
        operational_period_id: opId, group_id: null, division_id: null, name: newTopName.trim(),
      }).select().single()
      if (data) setTeams(prev => [...prev, data])
    }
    setNewTopName('')
    setSaving(false)
  }

  // ─── Create child unit ────────────────────────────────────────
  async function createChild() {
    if (!addChildFor || !newChildName.trim()) return
    setSaving(true); setError(null)
    const supabase = createClient()
    const { parentType, parentId, childType } = addChildFor
    if (childType === 'group') {
      const { data } = await supabase.from('groups').insert({
        operational_period_id: opId,
        division_id: parentId,
        name: newChildName.trim(),
      }).select().single()
      if (data) setGroups(prev => [...prev, data])
    } else {
      // Team under branch/division or under a group
      const groupId = parentType === 'group' ? parentId : null
      const divisionId = parentType !== 'group' ? parentId : null
      const { data } = await supabase.from('teams').insert({
        operational_period_id: opId,
        group_id: groupId,
        division_id: divisionId,
        name: newChildName.trim(),
      }).select().single()
      if (data) setTeams(prev => [...prev, data])
    }
    setNewChildName(''); setAddChildFor(null)
    setSaving(false)
  }

  // ─── Move group/team ──────────────────────────────────────────
  async function commitMove() {
    if (!movingItem) return
    setSaving(true); setError(null)
    const supabase = createClient()
    if (movingItem.type === 'group') {
      const newDivId = moveTargetId || null
      await supabase.from('groups').update({ division_id: newDivId }).eq('id', movingItem.id)
      setGroups(prev => prev.map(g => g.id === movingItem.id ? { ...g, division_id: newDivId } : g))
    } else {
      // Team: figure out if moving into a group or directly into branch/division
      const targetGroup = groups.find(g => g.id === moveTargetId)
      const targetDiv = divisions.find(d => d.id === moveTargetId)
      if (targetGroup) {
        await supabase.from('teams').update({ group_id: moveTargetId, division_id: null }).eq('id', movingItem.id)
        setTeams(prev => prev.map(t => t.id === movingItem.id ? { ...t, group_id: moveTargetId, division_id: null } : t))
      } else if (targetDiv) {
        await supabase.from('teams').update({ group_id: null, division_id: moveTargetId }).eq('id', movingItem.id)
        setTeams(prev => prev.map(t => t.id === movingItem.id ? { ...t, group_id: null, division_id: moveTargetId } : t))
      } else {
        await supabase.from('teams').update({ group_id: null, division_id: null }).eq('id', movingItem.id)
        setTeams(prev => prev.map(t => t.id === movingItem.id ? { ...t, group_id: null, division_id: null } : t))
      }
    }
    setMovingItem(null); setMoveTargetId('')
    setSaving(false)
  }

  // ─── Dual hat rule toggle ─────────────────────────────────────
  async function toggleDualHatRule(ruleId: string, enabled: boolean) {
    const supabase = createClient()
    await supabase.from('dual_hat_rules').update({ enabled }).eq('id', ruleId)
    setDualHatRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled } : r))
  }

  // ─── Command staff ────────────────────────────────────────────
  async function assignCommandStaff() {
    if (!cmdPosition || !cmdSelected) { setError('Select a position and person'); return }
    setSaving(true); setError(null)
    const supabase = createClient()
    const user = await getCurrentUser()

    const { blocked, message } = checkDuplicateAssignment(cmdSelected.id, cmdPosition)
    if (blocked) { setError(message!); setSaving(false); return }

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
      dual_hatted: false,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => [...prev, data])
    setCmdSelected(null); setCmdSearch(''); setCmdPosition('')
    setSaving(false)
  }

  // ─── Agency rep ───────────────────────────────────────────────
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
      dual_hatted: false,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    const newP = { id: newId, full_name: agencyName.trim(), default_agency: agencyOrg }
    setProfileMap(prev => ({ ...prev, [newId]: newP }))
    setAssignments(prev => [...prev, data])
    setAgencyName(''); setAgencyOrg('')
    setSaving(false)
  }

  // ─── Section staff (planning / logistics / finance) ───────────
  async function assignSectionPersonnel(section: 'planning' | 'logistics' | 'finance') {
    if (!assignPosition || !assignAgency) {
      setError('Position and agency are required'); return
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
      setProfileMap(prev => ({ ...prev, [newId]: { id: newId, full_name: manualName.trim(), default_agency: assignAgency } }))
    }

    const { blocked, dualHat, existingAssignment, message } = checkDuplicateAssignment(userId, assignPosition)
    if (blocked) { setError(message!); setSaving(false); return }
    if (dualHat && existingAssignment) {
      await supabase.from('assignments').update({ dual_hatted: true }).eq('id', existingAssignment.id)
      setAssignments(prev => prev.map(a => a.id === existingAssignment.id ? { ...a, dual_hatted: true } : a))
    }

    const sectionTeamName = `__${section}__`
    let sectionTeam = teams.find(t => t.name === sectionTeamName)
    if (!sectionTeam) {
      const { data: t } = await supabase.from('teams')
        .insert({ operational_period_id: opId, group_id: null, name: sectionTeamName })
        .select().single()
      if (t) { sectionTeam = t; setTeams(prev => [...prev, t]) }
    }
    if (!sectionTeam) { setError('Failed to create section team'); setSaving(false); return }

    const { data, error: err } = await supabase.from('assignments').insert({
      operational_period_id: opId,
      team_id: sectionTeam.id,
      user_id: userId,
      ics_position: assignPosition,
      home_agency: assignAgency,
      home_unit: assignUnit || null,
      assigned_by: user!.id,
      dual_hatted: dualHat,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return }
    setAssignments(prev => [...prev, data])
    setAssignSelected(null); setAssignSearch(''); setManualName('')
    setAssignPosition(''); setIsManual(false)
    setSaving(false)
  }

  // ─── Create profile ───────────────────────────────────────────
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

    if (newPhone || newNotes) {
      await supabase.from('profiles').update({
        phone: newPhone || null, notes: newNotes || null,
      }).eq('id', data)
    }

    const newP = {
      id: data, full_name: newName.trim(), email: newEmail.trim(),
      role: newRole, default_agency: newAgency || null,
      phone: newPhone || null, notes: newNotes || null,
    }
    setProfiles(prev => [...prev, newP].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setProfileMap(prev => ({ ...prev, [data]: newP }))
    setNewName(''); setNewEmail(''); setNewPhone(''); setNewAgency('')
    setNewRole('member'); setNewNotes('')
    setShowCreateProfile(false); setCreatingProfile(false)
  }

  // ─── Section assignment tallies ───────────────────────────────
  const sectionAssignments = useCallback((tab: SectionTab) => {
    if (tab === 'command') return assignments.filter(a =>
      ['incident_commander','deputy_incident_commander','safety_officer',
       'public_information_officer','liaison_officer'].includes(a.ics_position))
    if (tab === 'agency') return assignments.filter(a => a.ics_position === 'agency_representative')
    if (tab === 'ops') return assignments.filter(a => OPERATIONS_POSITIONS.map(p => p.value).includes(a.ics_position))
    if (tab === 'planning') return assignments.filter(a => PLANNING_POSITIONS.map(p => p.value).includes(a.ics_position))
    if (tab === 'logistics') return assignments.filter(a => LOGISTICS_POSITIONS.map(p => p.value).includes(a.ics_position))
    if (tab === 'finance') return assignments.filter(a => FINANCE_POSITIONS.map(p => p.value).includes(a.ics_position))
    return []
  }, [assignments])

  const isAdmin = profile?.role === 'admin'

  // ─── Shared person search widget ─────────────────────────────
  const renderPersonSearch = () => (
    <FormField label="Person">
      <div className="relative">
        {!isManual ? (
          <>
            {assignSelected ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 border border-orange-600 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300">
                  {getInitials(assignSelected.full_name)}
                </div>
                <span className="text-sm text-zinc-200 flex-1">{assignSelected.full_name}</span>
                {assignments.some(a => a.user_id === assignSelected.id) && (
                  <span className="text-xs text-amber-400 font-mono">assigned</span>
                )}
                <button onClick={() => { setAssignSelected(null); setAssignSearch('') }}
                  className="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ) : (
              <input type="text" className="input" placeholder="Type to search..."
                value={assignSearch} onChange={e => setAssignSearch(e.target.value)} />
            )}
            {assignResults.length > 0 && !assignSelected && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-10">
                {assignResults.map(p => {
                  const alreadyAssigned = assignments.some(a => a.user_id === p.id)
                  return (
                    <button key={p.id}
                      onClick={() => {
                        setAssignSelected(p); setAssignSearch(''); setAssignResults([])
                        setAssignAgency(p.default_agency ?? '')
                        setAssignUnit(p.default_unit ?? '')
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 text-left">
                      <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                        {getInitials(p.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200">{p.full_name}</p>
                        <p className="text-xs text-zinc-500">{p.default_agency ?? p.role}</p>
                      </div>
                      {alreadyAssigned && (
                        <span className="text-xs text-amber-500 font-mono flex-shrink-0">assigned</span>
                      )}
                    </button>
                  )
                })}
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

  // ─── Assignment inline form (ops tree) ────────────────────────
  const renderAssignForm = (forType: UnitType | 'member', unitId: string, label: string) => {
    const isActive = assignTarget?.type === forType && assignTarget?.unitId === unitId
    if (!isActive) return null
    const isMember = forType === 'member'
    return (
      <div className="mt-2 p-3 bg-zinc-900 border border-orange-700/40 rounded-lg space-y-3">
        <p className="text-xs text-orange-400 font-mono uppercase tracking-wider">
          Assign — {label}
        </p>
        {renderPersonSearch()}
        {isMember && (
          <FormField label="ICS Position *">
            <select className="input" value={assignPosition} onChange={e => setAssignPosition(e.target.value)}>
              <option value="">-- Select --</option>
              {OPERATIONS_POSITIONS.filter(p =>
                !['branch_director','division_supervisor','division_group_supervisor',
                  'group_supervisor','team_leader'].includes(p.value)
              ).map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </FormField>
        )}
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
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button
            onClick={isMember ? assignTeamMember : assignUnitLeader}
            loading={saving} variant="secondary" className="flex-1 text-sm">
            Assign
          </Button>
          <button onClick={clearAssignForm}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-3">Cancel</button>
        </div>
      </div>
    )
  }

  // ─── Person badge ─────────────────────────────────────────────
  const renderPersonBadge = (assignmentRecord: any, onRemove: () => void) => {
    const p = profileMap[assignmentRecord.user_id]
    const isDragging = draggingAssignmentId === assignmentRecord.id
    return (
      <div
        className={`flex items-center gap-2 ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''}`}
        draggable={isAdmin}
        onDragStart={e => {
          setDraggingAssignmentId(assignmentRecord.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('assignment-id', assignmentRecord.id)
        }}
        onDragEnd={() => { setDraggingAssignmentId(null); setDragOverTeamId(null) }}
      >
        <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
          {getInitials(p?.full_name ?? '?')}
        </div>
        <span className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</span>
        {assignmentRecord.dual_hatted && (
          <span className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">
            Dual Hatted
          </span>
        )}
        {isAdmin && (
          <button onClick={onRemove}
            className="text-zinc-600 hover:text-red-400 text-base leading-none ml-auto">×</button>
        )}
      </div>
    )
  }

  // ─── Add child inline form ────────────────────────────────────
  const renderAddChildForm = (
    parentType: 'branch' | 'division' | 'group',
    parentId: string,
    childType: 'group' | 'team'
  ) => {
    const isActive = addChildFor?.parentType === parentType
      && addChildFor?.parentId === parentId
      && addChildFor?.childType === childType
    if (!isActive) return null
    return (
      <div className="flex gap-2 mt-2">
        <input type="text" className="input flex-1 text-sm py-1.5"
          placeholder={`${childType === 'group' ? 'Group' : 'Team'} name...`}
          value={newChildName} onChange={e => setNewChildName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') createChild() }} />
        <Button onClick={createChild} loading={saving} variant="secondary"
          className="text-xs py-1.5 px-3">Add</Button>
        <button onClick={() => { setAddChildFor(null); setNewChildName('') }}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2">×</button>
      </div>
    )
  }

  // ─── Move form ────────────────────────────────────────────────
  const renderMoveForm = (type: 'group' | 'team', id: string) => {
    if (movingItem?.type !== type || movingItem?.id !== id) return null
    const targets = type === 'group'
      ? [{ id: '', name: '— Unassigned —' }, ...divisions.map(d => ({ id: d.id, name: `${d.name} (${d.type})` }))]
      : [{ id: '', name: '— Unassigned —' },
         ...divisions.map(d => ({ id: d.id, name: `${d.name} (${d.type})` })),
         ...groups.map(g => ({ id: g.id, name: `${g.name} (group)` }))]
    return (
      <div className="flex gap-2 mt-2">
        <select className="input flex-1 text-xs py-1" value={moveTargetId}
          onChange={e => setMoveTargetId(e.target.value)}>
          {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button onClick={commitMove} loading={saving} variant="secondary"
          className="text-xs py-1 px-3">Move</Button>
        <button onClick={() => setMovingItem(null)}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2">×</button>
      </div>
    )
  }

  // ─── Team node ────────────────────────────────────────────────
  const renderTeam = (team: any, depth = 0) => {
    const leader = getUnitLeader('team', team.id)
    const members = getTeamMembers(team.id)
    const isAssigningLeader = assignTarget?.type === 'team' && assignTarget?.unitId === team.id
    const isAssigningMember = assignTarget?.type === 'member' && assignTarget?.unitId === team.id

    const isDragTarget = dragOverTeamId === team.id
    return (
      <div key={team.id}
        className={`rounded-lg border ${isDragTarget ? 'border-orange-500 bg-orange-950/10' : 'border-zinc-800'} overflow-hidden ${depth > 0 ? 'ml-4' : ''}`}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTeamId(team.id) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTeamId(null) }}
        onDrop={async e => {
          e.preventDefault()
          const aid = e.dataTransfer.getData('assignment-id')
          setDragOverTeamId(null)
          if (aid) await reassignPersonToTeam(aid, team.id)
        }}
      >
        {/* Team header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60">
          <span className="text-xs font-mono text-zinc-500 uppercase">Team</span>
          <span className="text-sm font-medium text-zinc-200 flex-1">{team.name}</span>
          <span className="text-xs text-zinc-600">{members.length} member{members.length !== 1 ? 's' : ''}</span>
          {isAdmin && (
            <>
              <button onClick={() => deleteItem('teams', team.id)}
                className="text-zinc-600 hover:text-red-400 text-base leading-none ml-1">×</button>
              <button onClick={() => { setMovingItem({ type: 'team', id: team.id }); setMoveTargetId('') }}
                className="text-zinc-600 hover:text-zinc-400 text-xs ml-1">move</button>
            </>
          )}
        </div>

        <div className="px-3 py-2 space-y-2 bg-zinc-900/50">
          {/* Team leader row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-20 flex-shrink-0">Leader</span>
            {leader ? (
              renderPersonBadge(leader, () => deleteAssignment(leader.id))
            ) : (
              isAdmin && (
                <button
                  onClick={() => {
                    clearAssignForm()
                    setAssignTarget({ type: 'team', unitId: team.id, label: `${team.name} Leader` })
                  }}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    isAssigningLeader
                      ? 'bg-orange-600 text-white'
                      : 'text-orange-500 hover:text-orange-400 border border-zinc-700 hover:border-orange-600'
                  }`}>
                  + Assign Leader
                </button>
              )
            )}
          </div>

          {renderAssignForm('team', team.id, `${team.name} — Team Leader`)}

          {/* Members */}
          {members.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-zinc-800">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 pl-20">
                  {renderPersonBadge(m, () => deleteAssignment(m.id))}
                </div>
              ))}
            </div>
          )}

          {/* Add member */}
          {isAdmin && (
            <div className="pl-20">
              <button
                onClick={() => {
                  clearAssignForm()
                  setAssignTarget({ type: 'member', unitId: team.id, label: `${team.name} — Member` })
                }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  isAssigningMember
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
                }`}>
                + Add Member
              </button>
            </div>
          )}

          {renderAssignForm('member', team.id, `${team.name} — Member`)}
        </div>

        {renderMoveForm('team', team.id)}
      </div>
    )
  }

  // ─── Group node ───────────────────────────────────────────────
  const renderGroup = (group: any, depth = 0) => {
    const leader = getUnitLeader('group', group.id)
    const groupTeams = opsTeams.filter(t => t.group_id === group.id)
    const isAssigning = assignTarget?.type === 'group' && assignTarget?.unitId === group.id

    return (
      <div key={group.id}
        className={`rounded-xl border border-zinc-700 overflow-hidden ${depth > 0 ? 'ml-4' : ''}`}>
        {/* Group header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Group</span>
          <span className="text-sm font-semibold text-zinc-100 flex-1">{group.name}</span>
          {isAdmin && (
            <>
              <button
                onClick={() => {
                  setAddChildFor({ parentType: 'group', parentId: group.id, childType: 'team' })
                  setNewChildName('')
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300">+ Team</button>
              <button onClick={() => { setMovingItem({ type: 'group', id: group.id }); setMoveTargetId('') }}
                className="text-zinc-600 hover:text-zinc-400 text-xs ml-1">move</button>
              <button onClick={() => deleteItem('groups', group.id)}
                className="text-zinc-600 hover:text-red-400 text-base leading-none ml-1">×</button>
            </>
          )}
        </div>

        <div className="px-3 py-2.5 space-y-2 bg-zinc-900/60">
          {/* Group supervisor */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-24 flex-shrink-0">Supervisor</span>
            {leader ? (
              renderPersonBadge(leader, () => deleteAssignment(leader.id))
            ) : (
              isAdmin && (
                <button
                  onClick={() => {
                    clearAssignForm()
                    setAssignTarget({ type: 'group', unitId: group.id, label: `${group.name} Supervisor` })
                  }}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    isAssigning
                      ? 'bg-orange-600 text-white'
                      : 'text-orange-500 hover:text-orange-400 border border-zinc-700 hover:border-orange-600'
                  }`}>
                  + Assign Supervisor
                </button>
              )
            )}
          </div>

          {renderAssignForm('group', group.id, `${group.name} — Group Supervisor`)}

          {/* Inline add team form */}
          {renderAddChildForm('group', group.id, 'team')}

          {/* Teams */}
          {groupTeams.length > 0 && (
            <div className="space-y-2 pt-1">
              {groupTeams.map(t => renderTeam(t, 1))}
            </div>
          )}
        </div>

        {renderMoveForm('group', group.id)}
      </div>
    )
  }

  // ─── Branch / Division node ───────────────────────────────────
  const renderBranchDivision = (unit: any) => {
    const isBranch = unit.type === 'branch'
    const leader = getUnitLeader(isBranch ? 'branch' : 'division', unit.id)
    const isAssigning = assignTarget?.type === (isBranch ? 'branch' : 'division')
      && assignTarget?.unitId === unit.id
    const childGroups = groups.filter(g => g.division_id === unit.id)
    const directTeams = opsTeams.filter(
      t => t.division_id === unit.id && !t.group_id
    )

    return (
      <div key={unit.id}
        className={`rounded-xl border overflow-hidden ${
          isBranch ? 'border-orange-900/60' : 'border-sky-900/60'
        }`}>
        {/* Header */}
        <div className={`flex items-center gap-2 px-4 py-2.5 ${
          isBranch ? 'bg-orange-950/60' : 'bg-sky-950/60'
        }`}>
          <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${
            isBranch ? 'text-orange-400' : 'text-sky-400'
          }`}>
            {isBranch ? 'Branch' : 'Division'}
          </span>
          <span className="text-sm font-semibold text-zinc-100 flex-1">{unit.name}</span>
          {isAdmin && (
            <>
              {isBranch && (
                <button
                  onClick={() => {
                    setAddChildFor({ parentType: 'branch', parentId: unit.id, childType: 'group' })
                    setNewChildName('')
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300">+ Group</button>
              )}
              {!isBranch && (
                <button
                  onClick={() => {
                    setAddChildFor({ parentType: 'division', parentId: unit.id, childType: 'group' })
                    setNewChildName('')
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300">+ Group</button>
              )}
              <button
                onClick={() => {
                  setAddChildFor({ parentType: isBranch ? 'branch' : 'division', parentId: unit.id, childType: 'team' })
                  setNewChildName('')
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300 ml-2">+ Team</button>
              <button onClick={() => deleteItem('divisions', unit.id)}
                className="text-zinc-600 hover:text-red-400 text-base leading-none ml-2">×</button>
            </>
          )}
        </div>

        <div className="px-4 py-3 space-y-3 bg-zinc-900/40">
          {/* Director / Supervisor */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-24 flex-shrink-0">
              {isBranch ? 'Director' : 'Supervisor'}
            </span>
            {leader ? (
              renderPersonBadge(leader, () => deleteAssignment(leader.id))
            ) : (
              isAdmin && (
                <button
                  onClick={() => {
                    clearAssignForm()
                    setAssignTarget({
                      type: isBranch ? 'branch' : 'division',
                      unitId: unit.id,
                      label: `${unit.name} ${isBranch ? 'Branch Director' : 'Division Supervisor'}`,
                    })
                  }}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    isAssigning
                      ? 'bg-orange-600 text-white'
                      : 'text-orange-500 hover:text-orange-400 border border-zinc-700 hover:border-orange-600'
                  }`}>
                  + Assign {isBranch ? 'Director' : 'Supervisor'}
                </button>
              )
            )}
          </div>

          {renderAssignForm(
            isBranch ? 'branch' : 'division',
            unit.id,
            `${unit.name} — ${isBranch ? 'Branch Director' : 'Division Supervisor'}`
          )}

          {/* Inline child forms */}
          {renderAddChildForm(isBranch ? 'branch' : 'division', unit.id, 'group')}
          {renderAddChildForm(isBranch ? 'branch' : 'division', unit.id, 'team')}

          {/* Groups */}
          {childGroups.length > 0 && (
            <div className="space-y-2">
              {childGroups.map(g => renderGroup(g, 1))}
            </div>
          )}

          {/* Direct Teams (no group) */}
          {directTeams.length > 0 && (
            <div className="space-y-2">
              {directTeams.map(t => renderTeam(t, 1))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Dual hat rules panel ─────────────────────────────────────
  const renderDualHatPanel = () => (
    <div className="border border-zinc-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setShowDualHatPanel(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 text-left">
        <div>
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Dual Hat Rules</p>
          <p className="text-xs text-zinc-600 mt-0.5">Control which combined roles are allowed</p>
        </div>
        <span className="text-zinc-500 text-sm">{showDualHatPanel ? '▲' : '▼'}</span>
      </button>

      {showDualHatPanel && (
        <div className="px-4 py-3 bg-zinc-900/60 space-y-3">
          <p className="text-xs text-zinc-500 leading-relaxed">
            Dual hatting allows one person to hold two approved roles during smaller incidents.
            Only the combinations listed here are permitted — all others are blocked.
          </p>
          <div className="space-y-2">
            {dualHatRules.map(rule => (
              <div key={rule.id}
                className="flex items-start gap-3 p-3 bg-zinc-800 rounded-lg">
                <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                  <div
                    onClick={() => isAdmin && toggleDualHatRule(rule.id, !rule.enabled)}
                    className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                      rule.enabled ? 'bg-orange-600' : 'bg-zinc-700'
                    } ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-200">{rule.label}</p>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {getPositionLabel(rule.role1)} + {getPositionLabel(rule.role2)}
                    </p>
                  </div>
                </label>
                <span className={`text-xs font-mono flex-shrink-0 mt-0.5 ${rule.enabled ? 'text-green-400' : 'text-zinc-600'}`}>
                  {rule.enabled ? 'enabled' : 'off'}
                </span>
              </div>
            ))}
          </div>
          {!isAdmin && (
            <p className="text-xs text-zinc-600">Only admins can change dual hat rules.</p>
          )}
        </div>
      )}
    </div>
  )

  // ─── Loading ──────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Loading...</p>
    </div>
  )

  // Unassigned groups (no parent division/branch)
  const unassignedGroups = groups.filter(g => !g.division_id)
  // Unassigned teams (no group, no division)
  const unassignedTeams = opsTeams.filter(t => !t.group_id && !t.division_id)
  // Show drag hint when an admin has teams to drag between
  const showDragHint = isAdmin && opsTeams.length > 1

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

      {/* Section tabs */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {TABS.map(tab => (
          <button key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(null); clearAssignForm() }}
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
            <FormField label="Phone">
              <input type="tel" className="input" value={newPhone}
                placeholder="313-555-0100" onChange={e => setNewPhone(e.target.value)} />
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
            <FormField label="Notes">
              <input type="text" className="input" value={newNotes}
                placeholder="Optional" onChange={e => setNewNotes(e.target.value)} />
            </FormField>
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <div className="flex gap-2">
            <Button onClick={createProfile} loading={creatingProfile} variant="secondary">Create Profile</Button>
            <button onClick={() => setShowCreateProfile(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-3">Cancel</button>
          </div>
        </div>
      )}

      {error && !assignTarget && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {/* ── COMMAND STAFF ── */}
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
                    {a.dual_hatted && (
                      <span className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">DH</span>
                    )}
                    <button onClick={() => deleteAssignment(a.id)}
                      className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AGENCY REPS ── */}
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
          <Button onClick={assignAgencyRep} loading={saving} className="w-full">Add Representative</Button>
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

      {/* ── OPERATIONS ── */}
      {activeTab === 'ops' && (
        <div className="space-y-4">
          {showDragHint && (
            <p className="text-[11px] text-zinc-600 font-mono text-center">
              Drag person badges between teams to reassign
            </p>
          )}

          {/* Operations Ops Section-level positions (Chief/Deputy/Staging) */}
          {sectionAssignments('ops').filter(a =>
            ['operations_section_chief','operations_section_deputy','staging_area_manager',
             'air_ops_branch_director'].includes(a.ics_position)
          ).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Section Level</p>
              <div className="space-y-2">
                {sectionAssignments('ops').filter(a =>
                  ['operations_section_chief','operations_section_deputy','staging_area_manager',
                   'air_ops_branch_director'].includes(a.ics_position)
                ).map(a => {
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
                      {a.dual_hatted && (
                        <span className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">DH</span>
                      )}
                      <button onClick={() => deleteAssignment(a.id)}
                        className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Create top-level unit ── */}
          {isAdmin && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Add to Structure</p>
              <div className="flex gap-2 flex-wrap mb-2">
                {(['branch','division','group','team'] as const).map(t => (
                  <button key={t}
                    onClick={() => setNewTopType(t)}
                    className={`px-3 py-1.5 rounded text-xs font-mono transition-colors capitalize ${
                      newTopType === t ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" className="input flex-1 text-sm"
                  value={newTopName}
                  placeholder={`e.g. ${newTopType === 'branch' ? 'North Branch' : newTopType === 'division' ? 'East Division' : newTopType === 'group' ? 'Search Group' : 'Team Alpha'}`}
                  onChange={e => setNewTopName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createTopLevel() }} />
                <Button onClick={createTopLevel} loading={saving} variant="secondary">Add</Button>
              </div>
            </div>
          )}

          {/* ── Org tree ── */}
          {(branches.length > 0 || divs.length > 0 || unassignedGroups.length > 0 || unassignedTeams.length > 0) ? (
            <div className="space-y-3">
              {branches.map(b => renderBranchDivision(b))}
              {divs.map(d => renderBranchDivision(d))}
              {unassignedGroups.length > 0 && (
                <div className="space-y-2">
                  {unassignedGroups.map(g => renderGroup(g, 0))}
                </div>
              )}
              {unassignedTeams.length > 0 && (
                <div className="space-y-2">
                  {unassignedTeams.map(t => renderTeam(t, 0))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
              <p className="text-zinc-500 text-sm">No structure yet.</p>
              <p className="text-zinc-600 text-xs mt-1">
                Add a Branch, Division, Group, or Team above to get started.
              </p>
            </div>
          )}

          {/* ── Dual Hat Rules ── */}
          {renderDualHatPanel()}

          <div className="text-center pt-2">
            <Link href={`/events/${eventId}/op/${opId}/org`}
              className="text-xs text-orange-500 hover:text-orange-400 underline-offset-2 hover:underline">
              View org chart →
            </Link>
          </div>
        </div>
      )}

      {/* ── PLANNING / LOGISTICS / FINANCE ── */}
      {(['planning', 'logistics', 'finance'] as SectionTab[]).includes(activeTab) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
            {activeTab === 'planning' ? 'Planning Section'
              : activeTab === 'logistics' ? 'Logistics Section'
              : 'Finance / Admin Section'}
          </p>
          <FormField label="ICS Position *">
            <select className="input" value={assignPosition} onChange={e => setAssignPosition(e.target.value)}>
              <option value="">-- Select position --</option>
              {(activeTab === 'planning' ? PLANNING_POSITIONS
                : activeTab === 'logistics' ? LOGISTICS_POSITIONS
                : FINANCE_POSITIONS).map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </FormField>
          {renderPersonSearch()}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Home Agency *">
              <input type="text" className="input" value={assignAgency} onChange={e => setAssignAgency(e.target.value)} />
            </FormField>
            <FormField label="Unit">
              <input type="text" className="input" value={assignUnit} onChange={e => setAssignUnit(e.target.value)} />
            </FormField>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button
            onClick={() => assignSectionPersonnel(activeTab as 'planning' | 'logistics' | 'finance')}
            loading={saving} className="w-full">
            Assign to {activeTab === 'planning' ? 'Planning' : activeTab === 'logistics' ? 'Logistics' : 'Finance'}
          </Button>
          {sectionAssignments(activeTab).length > 0 && (
            <div className="space-y-2 border-t border-zinc-800 pt-4">
              {sectionAssignments(activeTab).map(a => {
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
                    {a.dual_hatted && (
                      <span className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded font-mono">DH</span>
                    )}
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
