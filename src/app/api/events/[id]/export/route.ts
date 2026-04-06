 import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const [{ data: event }, { data: assignments }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).single(),
    supabase.from('assignments').select('*').eq('event_id', id),
  ])

  if (!event) return new NextResponse('Not found', { status: 404 })

  const userIds = (assignments ?? []).map((a: any) => a.user_id)
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('*').in('id', userIds)
    : { data: [] }

  const profileMap = (profiles ?? []).reduce((acc: any, p: any) => {
    acc[p.id] = p
    return acc
  }, {})

  const { data: entries } = await supabase
    .from('activity_entries')
    .select('*')
    .eq('event_id', id)
    .order('entry_time')

  const lines: string[] = []
  lines.push('ICS 214 - ACTIVITY LOG')
  lines.push('='.repeat(50))
  lines.push(`Incident Name: ${event.name}`)
  if (event.incident_number) lines.push(`Incident #: ${event.incident_number}`)
  if (event.location) lines.push(`Location: ${event.location}`)
  lines.push(`Op Period: ${new Date(event.op_period_start).toLocaleString()} - ${new Date(event.op_period_end).toLocaleString()}`)
  lines.push('')

  for (const assignment of (assignments ?? [])) {
    const p = profileMap[assignment.user_id]
    lines.push('='.repeat(50))
    lines.push(`Name: ${p?.full_name ?? 'Unknown'}`)
    lines.push(`ICS Position: ${assignment.ics_position}`)
    lines.push(`Home Agency: ${assignment.home_agency}${assignment.home_unit ? ' / ' + assignment.home_unit : ''}`)
    lines.push('')
    lines.push('ACTIVITY LOG:')
    lines.push('-'.repeat(30))

    const userEntries = (entries ?? []).filter((e: any) => e.assignment_id === assignment.id)

    if (userEntries.length === 0) {
      lines.push('No entries recorded.')
    } else {
      for (const entry of userEntries) {
        lines.push(new Date(entry.entry_time).toLocaleString())
        lines.push(`  ${entry.narrative}`)
        lines.push('')
      }
    }

    lines.push(`Prepared by: ${p?.full_name}`)
    lines.push(`Position: ${assignment.ics_position}`)
    lines.push('')
  }

  const text = lines.join('\n')
  const filename = `ICS214_${event.name.replace(/\s+/g, '_')}.txt`

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}