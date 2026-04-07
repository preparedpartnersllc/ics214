import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { HomeButton } from '@/components/ui/HomeButton'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  let events: any[] = []

  if (profile.role === 'admin' || profile.role === 'supervisor') {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
    events = data ?? []
  } else {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('operational_period_id')
      .eq('user_id', user.id)

    const opIds = assignments?.map((a: any) => a.operational_period_id) ?? []

    if (opIds.length > 0) {
      const { data: ops } = await supabase
        .from('operational_periods')
        .select('event_id')
        .in('id', opIds)

      const eventIds = [...new Set(ops?.map((o: any) => o.event_id) ?? [])]

      if (eventIds.length > 0) {
        const { data } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds)
          .order('created_at', { ascending: false })
        events = data ?? []
      }
    }
  }

  const eventIds = events.map((e: any) => e.id)
  const { data: allOps } = eventIds.length > 0
    ? await supabase
        .from('operational_periods')
        .select('*')
        .in('event_id', eventIds)
        .order('period_number', { ascending: true })
    : { data: [] }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Events</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {profile.role === 'member' ? 'Your assigned events' : 'All events'}
          </p>
        </div>
        {profile.role === 'admin' && (
          <Link href="/events/new"
            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors">
            + New Event
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {events.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-12 text-center">
            <p className="text-zinc-600 text-sm">
              {profile.role === 'member' ? 'You are not assigned to any events.' : 'No events yet.'}
            </p>
            {profile.role === 'admin' && (
              <Link href="/events/new"
                className="inline-block mt-4 bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-700 transition-colors">
                Create first event
              </Link>
            )}
          </div>
        )}

        {events.map((event: any) => {
          const eventOps = (allOps ?? []).filter((op: any) => op.event_id === event.id)

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
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
                    <span className="text-xs font-mono text-zinc-500">
                      #{event.incident_number}
                    </span>
                  )}
                </div>
                <p className="text-base font-mono font-medium text-zinc-300">
                  {new Date(event.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              </div>

              <p className="text-lg font-semibold text-zinc-100 mb-1">{event.name}</p>

              {event.location && (
                <p className="text-sm text-zinc-500 mb-2">{event.location}</p>
              )}

              {event.summary && (
                <p className="text-sm text-zinc-400 mb-3 leading-relaxed border-l-2 border-zinc-700 pl-3">
                  {event.summary}
                </p>
              )}

              {eventOps.length > 0 && (
                <div className="border-t border-zinc-800 pt-3 mt-2">
                  <p className="text-xs text-zinc-600 font-mono uppercase tracking-wider mb-2">
                    Operational Periods ({eventOps.length})
                  </p>
                  <div className="space-y-1">
                    {eventOps.map((op: any) => (
                      <div key={op.id}
                        className="flex items-center justify-between text-xs">
                        <span className="font-mono text-zinc-400">
                          OP {op.period_number}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 font-mono">
                            {new Date(op.op_period_start).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric'
                            })} {new Date(op.op_period_start).toLocaleTimeString('en-US', {
                              hour: '2-digit', minute: '2-digit', hour12: false
                            })} — {new Date(op.op_period_end).toLocaleTimeString('en-US', {
                              hour: '2-digit', minute: '2-digit', hour12: false
                            })}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded font-mono ${
                            op.status === 'active'
                              ? 'bg-green-900/40 text-green-500'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}>
                            {op.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}