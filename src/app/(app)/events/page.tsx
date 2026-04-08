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
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Events</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {profile.role === 'member' ? 'Your assigned events' : 'All incidents'}
          </p>
        </div>
        {profile.role === 'admin' && (
          <Link href="/events/new"
            className="inline-flex items-center gap-1.5 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors shadow-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Event
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

        {events.map((event: any) => {
          const eventOps = (allOps ?? []).filter((op: any) => op.event_id === event.id)
          const activeOps = eventOps.filter((op: any) => op.status === 'active')

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 hover:bg-zinc-800/30 transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ring-1 ring-inset ${
                    event.status === 'active'
                      ? 'bg-green-500/10 text-green-400 ring-green-500/20'
                      : event.status === 'closed'
                      ? 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20'
                      : 'bg-zinc-500/10 text-zinc-500 ring-zinc-700/30'
                  }`}>
                    {event.status}
                  </span>
                  {event.incident_number && (
                    <span className="text-xs font-mono text-zinc-500">#{event.incident_number}</span>
                  )}
                </div>
                <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>

              <p className="text-base font-semibold text-zinc-100 mb-0.5">{event.name}</p>

              {event.location && (
                <p className="text-sm text-zinc-500 mb-2">{event.location}</p>
              )}

              {event.summary && (
                <p className="text-sm text-zinc-400 mb-3 leading-relaxed border-l-2 border-zinc-700 pl-3">
                  {event.summary}
                </p>
              )}

              {eventOps.length > 0 && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-800">
                  <span className="text-xs text-zinc-600">{eventOps.length} operational {eventOps.length === 1 ? 'period' : 'periods'}</span>
                  {activeOps.length > 0 && (
                    <span className="text-xs text-green-500">{activeOps.length} active</span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
