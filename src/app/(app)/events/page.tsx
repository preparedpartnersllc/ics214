import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
    // Members only see events they are assigned to
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

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
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

      <div className="space-y-3">
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

        {events.map((event: any) => (
          <Link
            key={event.id}
            href={`/events/${event.id}`}
            className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
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
                <p className="text-zinc-100 font-medium truncate">{event.name}</p>
                {event.location && (
                  <p className="text-sm text-zinc-500 mt-0.5">{event.location}</p>
                )}
              </div>
              <span className="text-xs text-zinc-600 flex-shrink-0">
                {new Date(event.created_at).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Dashboard
        </Link>
      </div>
    </div>
  )
}