import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: myAssignments } = await supabase
    .from('assignments')
    .select('operational_period_id')
    .eq('user_id', user.id)

  const opIds = myAssignments?.map((a: any) => a.operational_period_id) ?? []

  let myEvents: any[] = []
  if (opIds.length > 0) {
    const { data: ops } = await supabase
      .from('operational_periods')
      .select('event_id')
      .in('id', opIds)

    const eventIds = [...new Set(ops?.map((o: any) => o.event_id) ?? [])]

    if (eventIds.length > 0) {
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      myEvents = events ?? []
    }
  }

  let allEvents: any[] = []
  if (profile.role === 'admin' || profile.role === 'supervisor') {
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    allEvents = events ?? []
  }

  const displayEvents = profile.role === 'member' ? myEvents : allEvents

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-orange-500 font-mono text-xs tracking-widest uppercase">
            Incident Management
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">
          {profile.full_name}
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5 capitalize">{profile.role}</p>
      </div>

      {/* Nav grid — new arrangement:
          Row 1: Profile | Staff Review
          Row 2: New Event | Events        */}
      <div className="grid grid-cols-2 gap-3 mb-8">

        {/* Row 1 left: Profile */}
        <Link href="/profile"
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
          <p className="text-zinc-100 font-medium text-sm">Profile</p>
          <p className="text-zinc-500 text-xs mt-0.5">Settings & timezone</p>
        </Link>

        {/* Row 1 right: Staff Review (admin/supervisor only, else Events) */}
        {(profile.role === 'admin' || profile.role === 'supervisor') ? (
          <Link href="/staff"
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
            <p className="text-zinc-100 font-medium text-sm">Staff Review</p>
            <p className="text-zinc-500 text-xs mt-0.5">Review activity logs</p>
          </Link>
        ) : (
          <Link href="/events"
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
            <p className="text-zinc-100 font-medium text-sm">Events</p>
            <p className="text-zinc-500 text-xs mt-0.5">All incidents</p>
          </Link>
        )}

        {/* Row 2 left: New Event (admin only, else empty placeholder) */}
        {profile.role === 'admin' ? (
          <Link href="/events/new"
            className="bg-orange-950/30 border border-orange-900/50 rounded-xl p-4 hover:border-orange-700 transition-colors">
            <p className="text-orange-300 font-medium text-sm">+ New Event</p>
            <p className="text-orange-600/70 text-xs mt-0.5">Create incident</p>
          </Link>
        ) : (
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
            <p className="text-zinc-600 font-medium text-sm">My 214s</p>
            <p className="text-zinc-700 text-xs mt-0.5">Activity logs</p>
          </div>
        )}

        {/* Row 2 right: Events */}
        <Link href="/events"
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
          <p className="text-zinc-100 font-medium text-sm">Events</p>
          <p className="text-zinc-500 text-xs mt-0.5">All incidents</p>
        </Link>
      </div>

      {/* Member: my active events */}
      {profile.role === 'member' && (
        <div>
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
            My Active Events
          </p>
          {myEvents.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-8 text-center">
              <p className="text-zinc-600 text-sm">Not assigned to any active events.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myEvents.map((event: any) => (
                <Link key={event.id} href={`/events/${event.id}`}
                  className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                  <p className="text-zinc-100 font-medium">{event.name}</p>
                  {event.location && <p className="text-zinc-500 text-sm mt-0.5">{event.location}</p>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin/supervisor: recent events */}
      {(profile.role === 'admin' || profile.role === 'supervisor') && (
        <div>
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
            Recent Events
          </p>
          <div className="space-y-3">
            {displayEvents.map((event: any) => (
              <Link key={event.id} href={`/events/${event.id}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-100 font-medium">{event.name}</p>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                    event.status === 'active'
                      ? 'bg-green-900/50 text-green-400 border-green-800'
                      : event.status === 'closed'
                      ? 'bg-red-900/50 text-red-400 border-red-800'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}>
                    {event.status}
                  </span>
                </div>
                {event.location && <p className="text-zinc-500 text-sm mt-0.5">{event.location}</p>}
              </Link>
            ))}
            {displayEvents.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-8 text-center">
                <p className="text-zinc-600 text-sm">No events yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}