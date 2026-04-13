import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventsClient } from './_components/EventsClient'
import { isAdminRole, isPrivilegedRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  let events: any[] = []

  if (isPrivilegedRole(profile.role)) {
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

  const isAdmin  = isAdminRole(profile.role)
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

        {/* Empty state for non-admin members with no events */}
        {events.length === 0 && isMember && (
          <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-12 text-center">
            <p className="text-[#6B7280] text-sm">You are not assigned to any events.</p>
          </div>
        )}

        {/* Event cards (client component handles admin actions) */}
        {(events.length > 0 || isAdmin) && (
          <EventsClient
            initialEvents={events}
            initialOps={allOps ?? []}
            isAdmin={isAdmin}
          />
        )}

      </main>
    </div>
  )
}
