 import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPositionLabel } from '@/lib/ics-positions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; opId: string; userId: string }> }
) {
  const { id: eventId, opId, userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  // Allow supervisors, admins, or the person themselves
  const isSelf = user.id === userId
  const isPrivileged = profile?.role === 'admin' || profile?.role === 'supervisor'
  if (!isSelf && !isPrivileged) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const [{ data: event }, { data: op }, { data: memberProfile }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('operational_periods').select('*').eq('id', opId).single(),
    supabase.from('profiles').select('*').eq('id', userId).single(),
  ])

  if (!event || !op || !memberProfile) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('operational_period_id', opId)
    .eq('user_id', userId)
    .single()

  if (!assignment) return new NextResponse('Not assigned', { status: 404 })

  const { data: team } = await supabase
    .from('teams').select('*').eq('id', assignment.team_id).single()

  const { data: entries } = await supabase
    .from('activity_entries')
    .select('*')
    .eq('assignment_id', assignment.id)
    .order('entry_time')

  const lines: string[] = []
  lines.push('ICS 214 - ACTIVITY LOG')
  lines.push('='.repeat(50))
  lines.push(`Incident Name: ${event.name}`)
  if (event.incident_number) lines.push(`Incident #: ${event.incident_number}`)
  if (event.location) lines.push(`Location: ${event.location}`)
  lines.push(`Operational Period: ${op.period_number}`)
  lines.push(`Op Period: ${new Date(op.op_period_start).toLocaleString()} — ${new Date(op.op_period_end).toLocaleString()}`)
  lines.push('')
  lines.push(`Name: ${memberProfile.full_name}`)
  lines.push(`ICS Position: ${getPositionLabel(assignment.ics_position)}`)
  lines.push(`Home Agency: ${assignment.home_agency}${assignment.home_unit ? ' / ' + assignment.home_unit : ''}`)
  lines.push(`Team: ${team?.name ?? 'Unknown'}`)
  lines.push('')
  lines.push('ACTIVITY LOG:')
  lines.push('-'.repeat(30))

  if ((entries ?? []).length === 0) {
    lines.push('No entries recorded.')
  } else {
    for (const entry of (entries ?? [])) {
      lines.push(new Date(entry.entry_time).toLocaleString())
      lines.push(`  ${entry.narrative}`)
      lines.push(`  ${entry.reviewed ? '✓ Reviewed' : 'Pending review'}`)
      lines.push('')
    }
  }

  lines.push('='.repeat(50))
  lines.push(`Prepared by: ${memberProfile.full_name}`)
  lines.push(`Position: ${getPositionLabel(assignment.ics_position)}`)
  lines.push(`Date/Time: ${new Date().toLocaleString()}`)

  const text = lines.join('\n')
  const filename = `ICS214_${memberProfile.full_name.replace(/\s+/g, '_')}_OP${op.period_number}.txt`

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}