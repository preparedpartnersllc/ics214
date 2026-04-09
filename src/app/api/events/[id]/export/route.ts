import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPositionLabel } from '@/lib/ics-positions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'member') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { data: event } = await supabase
    .from('events').select('*').eq('id', id).single()
  if (!event) return new NextResponse('Not found', { status: 404 })

  const { data: ops } = await supabase
    .from('operational_periods')
    .select('*')
    .eq('event_id', id)
    .order('period_number')

  const opIds = (ops ?? []).map((o: any) => o.id)

  const [{ data: assignments }, { data: entries }, { data: teams }] = await Promise.all([
    opIds.length > 0
      ? supabase.from('assignments').select('*').in('operational_period_id', opIds)
      : { data: [] },
    opIds.length > 0
      ? supabase.from('activity_entries').select('*').in('operational_period_id', opIds).order('entry_time')
      : { data: [] },
    opIds.length > 0
      ? supabase.from('teams').select('*').in('operational_period_id', opIds)
      : { data: [] },
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

  const lines: string[] = []
  lines.push('ICS 214 - ACTIVITY LOG — BULK EXPORT')
  lines.push('='.repeat(60))
  lines.push(`Incident Name: ${event.name}`)
  if (event.incident_number) lines.push(`Incident #: ${event.incident_number}`)
  if (event.location) lines.push(`Location: ${event.location}`)
  lines.push(`Status: ${event.status}`)
  lines.push(`Exported: ${new Date().toLocaleString()}`)
  lines.push('')

  for (const op of (ops ?? [])) {
    lines.push('='.repeat(60))
    lines.push(`OPERATIONAL PERIOD ${op.period_number}`)
    lines.push(`${new Date(op.op_period_start).toLocaleString()} — ${new Date(op.op_period_end).toLocaleString()}`)
    lines.push('')

    const opAssignments = (assignments ?? []).filter((a: any) => a.operational_period_id === op.id)

    if (opAssignments.length === 0) {
      lines.push('No personnel assigned.')
      lines.push('')
      continue
    }

    for (const assignment of opAssignments) {
      const p = profileMap[assignment.user_id]
      const team = teamMap[assignment.team_id]
      const userEntries = (entries ?? []).filter((e: any) => e.assignment_id === assignment.id)

      lines.push('-'.repeat(40))
      lines.push(`Name: ${p?.full_name ?? 'Unknown'}`)
      lines.push(`ICS Position: ${getPositionLabel(assignment.ics_position)}`)
      lines.push(`Home Agency: ${assignment.home_agency}${assignment.home_unit ? ' / ' + assignment.home_unit : ''}`)
      lines.push(`Team: ${team?.name ?? 'Unknown'}`)
      lines.push('')
      lines.push('Activity Log:')

      if (userEntries.length === 0) {
        lines.push('  No entries recorded.')
      } else {
        for (const entry of userEntries) {
          lines.push(`  ${new Date(entry.entry_time).toLocaleString()}`)
          lines.push(`    ${entry.narrative}`)
          lines.push('')
        }
      }

      lines.push(`Prepared by: ${p?.full_name} — ${getPositionLabel(assignment.ics_position)}`)
      lines.push('')
    }
  }

  const text = lines.join('\n')
  const filename = `ICS214_${event.name.replace(/\s+/g, '_')}_ALL_OPS.txt`

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
