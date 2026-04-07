 import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPositionLabel } from '@/lib/ics-positions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; opId: string }> }
) {
  const { id: eventId, opId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'member') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const [{ data: event }, { data: op }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('operational_periods').select('*').eq('id', opId).single(),
  ])

  if (!event || !op) return new NextResponse('Not found', { status: 404 })

  const [{ data: assignments }, { data: entries }, { data: teams }, { data: groups }, { data: divisions }] =
    await Promise.all([
      supabase.from('assignments').select('*').eq('operational_period_id', opId),
      supabase.from('activity_entries').select('*').eq('operational_period_id', opId).order('entry_time'),
      supabase.from('teams').select('*').eq('operational_period_id', opId),
      supabase.from('groups').select('*').eq('operational_period_id', opId),
      supabase.from('divisions').select('*').eq('operational_period_id', opId),
    ])

  const userIds = [...new Set((assignments ?? []).map((a: any) => a.user_id))]
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('*').in('id', userIds)
    : { data: [] }

  const profileMap = (profiles ?? []).reduce((acc: any, p: any) => {
    acc[p.id] = p; return acc
  }, {})

  const teamMap = (teams ?? []).reduce((acc: any, t: any) => {
    acc[t.id] = t; return acc
  }, {})

  const groupMap = (groups ?? []).reduce((acc: any, g: any) => {
    acc[g.id] = g; return acc
  }, {})

  const divMap = (divisions ?? []).reduce((acc: any, d: any) => {
    acc[d.id] = d; return acc
  }, {})

  const lines: string[] = []
  lines.push('ICS 214 - ACTIVITY LOG — OPERATIONAL PERIOD EXPORT')
  lines.push('='.repeat(60))
  lines.push(`Incident Name: ${event.name}`)
  if (event.incident_number) lines.push(`Incident #: ${event.incident_number}`)
  if (event.location) lines.push(`Location: ${event.location}`)
  lines.push(`Operational Period: ${op.period_number}`)
  lines.push(`Op Period: ${new Date(op.op_period_start).toLocaleString()} — ${new Date(op.op_period_end).toLocaleString()}`)
  lines.push(`Status: ${op.status}`)
  lines.push(`Exported: ${new Date().toLocaleString()}`)
  lines.push('')

  for (const assignment of (assignments ?? [])) {
    const p = profileMap[assignment.user_id]
    const team = teamMap[assignment.team_id]
    const group = team?.group_id ? groupMap[team.group_id] : null
    const division = group?.division_id ? divMap[group.division_id] : null
    const userEntries = (entries ?? []).filter((e: any) => e.assignment_id === assignment.id)

    lines.push('-'.repeat(40))
    lines.push(`Name: ${p?.full_name ?? 'Unknown'}`)
    lines.push(`ICS Position: ${getPositionLabel(assignment.ics_position)}`)
    lines.push(`Home Agency: ${assignment.home_agency}${assignment.home_unit ? ' / ' + assignment.home_unit : ''}`)
    lines.push(`Team: ${team?.name ?? 'Unknown'}`)
    if (group) lines.push(`Group: ${group.name}`)
    if (division) lines.push(`${division.type === 'branch' ? 'Branch' : 'Division'}: ${division.name}`)
    lines.push('')
    lines.push('Activity Log:')

    if (userEntries.length === 0) {
      lines.push('  No entries recorded.')
    } else {
      for (const entry of userEntries) {
        lines.push(`  ${new Date(entry.entry_time).toLocaleString()}`)
        lines.push(`    ${entry.narrative}`)
        lines.push(`    ${entry.reviewed ? '✓ Reviewed' : 'Pending review'}`)
        lines.push('')
      }
    }

    lines.push(`Prepared by: ${p?.full_name} — ${getPositionLabel(assignment.ics_position)}`)
    lines.push('')
  }

  const text = lines.join('\n')
  const filename = `ICS214_${event.name.replace(/\s+/g, '_')}_OP${op.period_number}.txt`

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}