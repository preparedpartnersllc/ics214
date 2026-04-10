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

  const isAdmin = profile.role === 'admin'
  const isMember = profile.role === 'member'

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        {/* Page title row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-[#E5E7EB]">Events</h1>
          {isAdmin && (
            <Link
              href="/events/new"
              className="inline-flex items-center gap-1.5 bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              New Event
            </Link>
          )}
        </div>

        {/* Empty state */}
        {events.length === 0 && (
          <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-12 text-center">
            <p className="text-[#6B7280] text-sm">
              {isMember ? 'You are not assigned to any events.' : 'No events yet.'}
            </p>
            {isAdmin && (
              <Link href="/events/new"
                className="inline-block mt-4 text-[#FF5A1F] text-sm hover:text-[#FF6A33] transition-colors">
                Create the first event →
              </Link>
            )}
          </div>
        )}

        {/* Event cards */}
        <div className="space-y-2">
          {events.map((event: any) => {
            const eventOps  = (allOps ?? []).filter((op: any) => op.event_id === event.id)
            const activeOps = eventOps.filter((op: any) => op.status === 'active')
            const isActive  = event.status === 'active'

            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className={`block bg-[#161D26] border rounded-2xl px-4 py-4 hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150 group ${
                  isActive ? 'border-[#22C55E]/20 hover:border-[#22C55E]/40' : 'border-[#232B36] hover:border-[#3a4555]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ring-1 ring-inset ${
                        isActive
                          ? 'bg-[#22C55E]/10 text-[#22C55E] ring-[#22C55E]/25'
                          : event.status === 'closed'
                          ? 'bg-[#6B7280]/10 text-[#9CA3AF] ring-[#9CA3AF]/20'
                          : 'bg-[#6B7280]/10 text-[#6B7280] ring-[#6B7280]/20'
                      }`}>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />}
                        {event.status}
                      </span>
                      {event.incident_number && (
                        <span className="text-xs font-mono text-[#4B5563]">#{event.incident_number}</span>
                      )}
                    </div>
                    <p className="text-[15px] font-semibold text-[#E5E7EB] leading-snug">{event.name}</p>
                    {event.location && (
                      <p className="text-xs text-[#6B7280] mt-0.5 truncate">{event.location}</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-[#2d3748] group-hover:text-[#6B7280] transition-colors duration-150 flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>

                {event.summary && (
                  <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed line-clamp-2 border-l-2 border-[#232B36] pl-3">
                    {event.summary}
                  </p>
                )}

                {eventOps.length > 0 && (
                  <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-[#232B36]/60">
                    <span className="text-xs text-[#6B7280]">
                      {eventOps.length} {eventOps.length === 1 ? 'period' : 'periods'}
                    </span>
                    {activeOps.length > 0 && (
                      <span className="text-xs font-medium text-[#22C55E]">
                        {activeOps.length} active
                      </span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
