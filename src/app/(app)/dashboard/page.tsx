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

  const isAdmin = profile.role === 'admin'
  const isMember = profile.role === 'member'

  // Events for this user
  let events: any[] = []
  if (profile.role === 'admin' || profile.role === 'supervisor') {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6)
    events = data ?? []
  } else {
    const { data: assignments } = await supabase
      .from('assignments').select('operational_period_id').eq('user_id', user.id)
    const opIds = assignments?.map((a: any) => a.operational_period_id) ?? []
    if (opIds.length > 0) {
      const { data: ops } = await supabase
        .from('operational_periods').select('event_id').in('id', opIds)
      const eventIds = [...new Set(ops?.map((o: any) => o.event_id) ?? [])]
      if (eventIds.length > 0) {
        const { data } = await supabase
          .from('events').select('*').in('id', eventIds)
          .eq('status', 'active').order('created_at', { ascending: false })
        events = data ?? []
      }
    }
  }

  const activeEvents = events.filter(e => e.status === 'active')
  const recentEvents = events

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-8 pb-12 max-w-2xl mx-auto w-full">

        {/* ── 1 · WELCOME ─────────────────────────────────────── */}
        <div className="mb-7">
          <p className="text-xs font-semibold text-[#FF5A1F] uppercase tracking-widest mb-1">
            Welcome back
          </p>
          <h1 className="text-2xl font-semibold text-[#E5E7EB] tracking-tight leading-tight">
            {profile.full_name}
          </h1>
          <p className="text-sm text-[#6B7280] mt-1 capitalize">{profile.role}</p>
        </div>

        {/* ── 2 · PRIMARY ACTION (admin only) ─────────────────── */}
        {isAdmin && (
          <div className="mb-8">
            <Link
              href="/events/new"
              className="flex items-center gap-3 bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.99] text-white px-5 py-4 rounded-2xl transition-all shadow-lg shadow-[#FF5A1F]/15 group"
            >
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 group-hover:bg-white/20 transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-base">New Event</p>
                <p className="text-sm text-white/70">Create a new incident or deployment</p>
              </div>
              <svg className="w-5 h-5 ml-auto text-white/50 group-hover:text-white/80 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          </div>
        )}

        {/* ── 3 · ACTIVE EVENTS ───────────────────────────────── */}
        {activeEvents.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
              Active Events
            </p>
            <div className="space-y-2">
              {activeEvents.map((event: any) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="flex items-center gap-3 bg-[#161D26] border border-[#22C55E]/20 rounded-2xl px-4 py-3.5 hover:border-[#22C55E]/40 hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150 group"
                >
                  <span className="w-2 h-2 rounded-full bg-[#22C55E] flex-shrink-0 animate-pulse" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#E5E7EB] truncate">{event.name}</p>
                    {event.location && (
                      <p className="text-xs text-[#6B7280] mt-0.5 truncate">{event.location}</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── 4 · RECENT EVENTS (non-admin sees active only; skip if same list) ── */}
        {!isMember && recentEvents.filter(e => e.status !== 'active').length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Recent Events</p>
            <div className="space-y-2">
              {recentEvents.filter(e => e.status !== 'active').map((event: any) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="flex items-center gap-3 bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3.5 hover:border-[#3a4555] hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ring-1 ring-inset ${
                        event.status === 'closed'
                          ? 'bg-[#6B7280]/10 text-[#9CA3AF] ring-[#9CA3AF]/20'
                          : 'bg-[#6B7280]/10 text-[#6B7280] ring-[#6B7280]/20'
                      }`}>
                        {event.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#E5E7EB] truncate">{event.name}</p>
                  </div>
                  <svg className="w-4 h-4 text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </Link>
              ))}
              <Link href="/events" className="block text-center text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors pt-1">
                View all events →
              </Link>
            </div>
          </div>
        )}

        {/* Member empty state */}
        {isMember && events.length === 0 && (
          <div className="mb-8 bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-10 text-center">
            <p className="text-[#6B7280] text-sm">Not assigned to any active events.</p>
          </div>
        )}

        {/* Admin empty state */}
        {isAdmin && events.length === 0 && (
          <div className="mb-8 bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-10 text-center">
            <p className="text-[#6B7280] text-sm">No events yet.</p>
            <Link href="/events/new" className="inline-block mt-3 text-[#FF5A1F] text-sm hover:text-[#FF6A33] transition-colors">
              Create the first event →
            </Link>
          </div>
        )}

        {/* ── 5 · QUICK ACCESS ────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Quick Access</p>
          <div className="space-y-2">
            <Link href="/events" className="group flex items-center gap-3 bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3.5 hover:border-[#3a4555] hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150">
              <div className="w-8 h-8 rounded-xl bg-[#121821] flex items-center justify-center text-[#9CA3AF] group-hover:bg-[#232B36] transition-colors flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#E5E7EB]">Events</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{isMember ? 'Your assigned incidents' : 'All incidents'}</p>
              </div>
              <svg className="w-4 h-4 ml-auto text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>

            <Link href="/meetings" className="group flex items-center gap-3 bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3.5 hover:border-[#3a4555] hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150">
              <div className="w-8 h-8 rounded-xl bg-[#121821] flex items-center justify-center text-[#9CA3AF] group-hover:bg-[#232B36] transition-colors flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#E5E7EB]">Meetings</p>
                <p className="text-xs text-[#6B7280] mt-0.5">Upcoming briefings and calls</p>
              </div>
              <svg className="w-4 h-4 ml-auto text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>

            {isAdmin && (
              <Link href="/admin/people" className="group flex items-center gap-3 bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3.5 hover:border-[#3a4555] hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150">
                <div className="w-8 h-8 rounded-xl bg-[#121821] flex items-center justify-center text-[#9CA3AF] group-hover:bg-[#232B36] transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-[#E5E7EB]">People</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">Manage profiles, roles, and invites</p>
                </div>
                <svg className="w-4 h-4 ml-auto text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
