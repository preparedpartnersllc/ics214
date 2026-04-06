import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDate, formatICSTime, getInitials } from '@/lib/utils'

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

  // Fetch assignments and profiles separately
  const { data: assignments } = await supabase
    .from('assignments')
    .select('*')
    .eq('event_id', id)
    .order('assigned_at')

  const assignmentList = assignments ?? []

  // Fetch profiles for each assigned user
  const userIds = assignmentList.map((a: any) => a.user_id)
  const { data: assignedProfiles } = userIds.length > 0
    ? await supabase.from('profiles').select('*').in('id', userIds)
    : { data: [] }

  const profileMap = (assignedProfiles ?? []).reduce((acc: any, p: any) => {
    acc[p.id] = p
    return acc
  }, {})

  const myAssignment = assignmentList.find((a: any) => a.user_id === user.id)

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
            event.status === 'active'
              ? 'bg-green-900/50 text-green-400 border-green-800'
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
        <p className="text-xs font-mono text-zinc-600 mt-2">
          OP: {formatDate(event.op_period_start)} {formatICSTime(event.op_period_start)}–{formatICSTime(event.op_period_end)}
        </p>
      </div>

      {myAssignment && (
        <div className="mb-6 bg-orange-950/30 border border-orange-900/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-300">Your Activity Log</p>
            <p className="text-xs text-orange-600/80 mt-0.5">ICS 214 — {myAssignment.ics_position}</p>
          </div>
          <Link href={`/events/${id}/log`}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors">
            Open My 214
          </Link>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <p className="text-sm font-medium text-zinc-300">
            Assigned Personnel ({assignmentList.length})
          </p>
          {profile.role === 'admin' && (
            <Link href={`/events/${id}/assign`}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
              + Assign
            </Link>
          )}
        </div>

        {assignmentList.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-600 text-center">No personnel assigned yet.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {assignmentList.map((a: any) => {
              const p = profileMap[a.user_id]
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                    {getInitials(p?.full_name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-zinc-500">{a.ics_position} · {a.home_agency}</p>
                  </div>
                  {a.user_id === user.id && (
                    <span className="text-xs text-orange-500 font-mono">you</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(profile.role === 'admin' || profile.role === 'supervisor') && (
        <div className="flex justify-between items-center mt-4">
          <Link href="/events" className="text-sm text-zinc-600 hover:text-zinc-400">
            ← Events
          </Link>
          <Link href={`/api/events/${id}/export`}
            className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            Export PDF
          </Link>
        </div>
      )}
    </div>
  )
}