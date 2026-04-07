import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatICSTime, formatDate, getInitials } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: event } = await supabase
    .from('events').select('*').eq('id', id).single()
  if (!event) notFound()

  // Get all operational periods for this event
  const { data: ops } = await supabase
    .from('operational_periods')
    .select('*')
    .eq('event_id', id)
    .order('period_number', { ascending: true })

  const opList = ops ?? []

  // For each OP, get the full org structure
  const opIds = opList.map((op: any) => op.id)

  const [{ data: divisions }, { data: groups }, { data: teams }, { data: assignments }] =
    await Promise.all([
      opIds.length > 0
        ? supabase.from('divisions').select('*').in('operational_period_id', opIds)
        : { data: [] },
      opIds.length > 0
        ? supabase.from('groups').select('*').in('operational_period_id', opIds)
        : { data: [] },
      opIds.length > 0
        ? supabase.from('teams').select('*').in('operational_period_id', opIds)
        : { data: [] },
      opIds.length > 0
        ? supabase.from('assignments').select('*').in('operational_period_id', opIds)
        : { data: [] },
    ])

  // Get profiles for assigned users
  const userIds = [...new Set((assignments ?? []).map((a: any) => a.user_id))]
  const { data: assignedProfiles } = userIds.length > 0
    ? await supabase.from('profiles').select('*').in('id', userIds)
    : { data: [] }

  const profileMap = (assignedProfiles ?? []).reduce((acc: any, p: any) => {
    acc[p.id] = p
    return acc
  }, {})

  // Check if current user is assigned to any OP
  const myAssignment = (assignments ?? []).find((a: any) => a.user_id === user.id)
  const myOp = myAssignment
    ? opList.find((op: any) => op.id === myAssignment.operational_period_id)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-3xl mx-auto">
      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
            event.status === 'active'
              ? 'bg-green-900/50 text-green-400 border-green-800'
              : event.status === 'closed'
              ? 'bg-red-900/50 text-red-400 border-red-800'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}>
            {event.status}
          </span>
          {event.incident_number && (
            <span className="text-xs font-mono text-zinc-500">#{event.incident_number}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">{event.name}</h1>
        {event.location && <p className="text-sm text-zinc-500 mt-0.5">{event.location}</p>}
      </div>

      {/* My 214 CTA */}
      {myAssignment && myOp && (
        <div className="mb-6 bg-orange-950/30 border border-orange-900/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-300">Your Activity Log</p>
            <p className="text-xs text-orange-600/80 mt-0.5">
              OP {myOp.period_number} — {myAssignment.ics_position.replace(/_/g, ' ')}
            </p>
          </div>
          <Link href={`/events/${id}/op/${myOp.id}/log`}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors">
            Open My 214
          </Link>
        </div>
      )}

      {/* Admin controls */}
      {profile.role === 'admin' && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <Link href={`/events/${id}/op/new`}
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors">
            + Operational Period
          </Link>
          {event.status === 'active' && (
            <DemobilizeButton eventId={id} />
          )}
          <Link href={`/api/events/${id}/export`}
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-3 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors">
            Export All
          </Link>
        </div>
      )}

      {/* Operational Periods */}
      {opList.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-8 text-center">
          <p className="text-zinc-600 text-sm">No operational periods yet.</p>
          {profile.role === 'admin' && (
            <Link href={`/events/${id}/op/new`}
              className="inline-block mt-3 text-orange-500 text-sm hover:underline">
              Create first operational period →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {opList.map((op: any) => {
            const opDivisions = (divisions ?? []).filter((d: any) => d.operational_period_id === op.id)
            const opAssignments = (assignments ?? []).filter((a: any) => a.operational_period_id === op.id)

            return (
              <div key={op.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* OP header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      Operational Period {op.period_number}
                    </p>
                    <p className="text-xs font-mono text-zinc-500 mt-0.5">
                      {formatDate(op.op_period_start)} {formatICSTime(op.op_period_start)} — {formatICSTime(op.op_period_end)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {profile.role === 'admin' && (
                      <Link href={`/events/${id}/op/${op.id}/build`}
                        className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                        Manage Org
                      </Link>
                    )}
                    {(profile.role === 'admin' || profile.role === 'supervisor') && (
                      <Link href={`/events/${id}/op/${op.id}/review`}
                        className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
                        Review 214s
                      </Link>
                    )}
                  </div>
                </div>

                {/* Org structure */}
                {opDivisions.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-zinc-600">No org structure built yet.</p>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {opDivisions.map((div: any) => {
                      const divGroups = (groups ?? []).filter((g: any) => g.division_id === div.id)
                      return (
                        <div key={div.id} className="px-4 py-3">
                          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">
                            {div.type === 'branch' ? 'Branch' : 'Division'}: {div.name}
                          </p>
                          {divGroups.map((grp: any) => {
                            const grpTeams = (teams ?? []).filter((t: any) => t.group_id === grp.id)
                            return (
                              <div key={grp.id} className="ml-3 mb-3">
                                <p className="text-xs text-zinc-500 mb-1">Group: {grp.name}</p>
                                {grpTeams.map((team: any) => {
                                  const teamMembers = opAssignments.filter((a: any) => a.team_id === team.id)
                                  return (
                                    <div key={team.id} className="ml-3 mb-2">
                                      <p className="text-xs text-zinc-600 mb-1">Team: {team.name}</p>
                                      {teamMembers.map((a: any) => {
                                        const p = profileMap[a.user_id]
                                        return (
                                          <Link
                                            key={a.id}
                                            href={`/events/${id}/op/${op.id}/member/${a.user_id}`}
                                            className="flex items-center gap-2 ml-3 py-1 hover:opacity-80 transition-opacity"
                                          >
                                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                                              {getInitials(p?.full_name ?? '?')}
                                            </div>
                                            <div>
                                              <span className="text-xs text-zinc-300">{p?.full_name ?? 'Unknown'}</span>
                                              <span className="text-xs text-zinc-600 ml-2">
                                                {a.ics_position.replace(/_/g, ' ')}
                                              </span>
                                            </div>
                                          </Link>
                                        )
                                      })}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* OP summary */}
                <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/50">
                  <p className="text-xs text-zinc-600">
                    {opAssignments.length} personnel assigned
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6">
        <Link href="/events" className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Events
        </Link>
      </div>
    </div>
  )
}

function DemobilizeButton({ eventId }: { eventId: string }) {
  return (
    <form action={async () => {
      'use server'
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      await supabase.from('events').update({ status: 'closed' }).eq('id', eventId)
    }}>
      <button type="submit"
        className="bg-red-950/50 text-red-400 border border-red-900 px-3 py-2 rounded-lg text-sm hover:bg-red-900/50 transition-colors">
        Demobilize
      </button>
    </form>
  )
}