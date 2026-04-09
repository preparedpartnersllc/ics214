import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function NavCard({ href, icon, title, description, accent = false }: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  accent?: boolean
}) {
  return (
    <Link href={href} className={`group flex flex-col rounded-2xl p-4 border transition-all ${
      accent
        ? 'bg-[#FF5A1F]/5 border-[#FF5A1F]/20 hover:border-[#FF5A1F]/40 hover:bg-[#FF5A1F]/10'
        : 'bg-[#161D26] border-[#232B36] hover:border-[#3a4555] hover:bg-[#1a2235]'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-colors ${
        accent
          ? 'bg-[#FF5A1F]/15 text-[#FF5A1F] group-hover:bg-[#FF5A1F]/25'
          : 'bg-[#121821] text-[#9CA3AF] group-hover:bg-[#232B36]'
      }`}>
        {icon}
      </div>
      <p className={`font-medium text-sm ${accent ? 'text-[#FF6A33]' : 'text-[#E5E7EB]'}`}>{title}</p>
      <p className={`text-xs mt-0.5 ${accent ? 'text-[#FF5A1F]/60' : 'text-[#6B7280]'}`}>{description}</p>
    </Link>
  )
}

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

  const isAdmin = profile.role === 'admin'

  return (
    <div className="min-h-screen bg-[#0B0F14] px-4 py-10 max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F]" />
          <span className="text-[#FF5A1F] text-xs font-semibold uppercase tracking-widest">
            Incident Management
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-[#E5E7EB] tracking-tight">{profile.full_name}</h1>
        <p className="text-[#6B7280] text-sm mt-1 capitalize">{profile.role}</p>
      </div>

      {/* Nav grid */}
      <div className="grid grid-cols-2 gap-3 mb-10">
        <NavCard
          href="/profile"
          title="Profile"
          description="Settings & timezone"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          }
        />

        <NavCard
          href="/events"
          title="Events"
          description="All incidents"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          }
        />

        {isAdmin && (
          <NavCard
            href="/events/new"
            title="New Event"
            description="Create incident"
            accent
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>
              </svg>
            }
          />
        )}


        {isAdmin && (
          <NavCard
            href="/admin/people"
            title="People"
            description="Manage profiles & invites"
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            }
          />
        )}

        {isAdmin && (
          <NavCard
            href="/admin/import"
            title="Import Profiles"
            description="Bulk CSV upload"
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            }
          />
        )}
      </div>

      {/* Events section */}
      <div>
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
          {profile.role === 'member' ? 'My Active Events' : 'Recent Events'}
        </p>

        {displayEvents.length === 0 ? (
          <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-8 text-center">
            <p className="text-[#6B7280] text-sm">
              {profile.role === 'member' ? 'Not assigned to any active events.' : 'No events yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayEvents.map((event: any) => (
              <Link key={event.id} href={`/events/${event.id}`}
                className="flex items-center justify-between bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3.5 hover:border-[#3a4555] hover:bg-[#1a2235] transition-all group">
                <div className="min-w-0">
                  <p className="text-[#E5E7EB] font-medium text-sm truncate">{event.name}</p>
                  {event.location && <p className="text-[#6B7280] text-xs mt-0.5 truncate">{event.location}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ring-1 ring-inset ${
                    event.status === 'active'
                      ? 'bg-[#22C55E]/10 text-[#22C55E] ring-[#22C55E]/20'
                      : event.status === 'closed'
                      ? 'bg-[#6B7280]/10 text-[#9CA3AF] ring-[#9CA3AF]/20'
                      : 'bg-[#6B7280]/10 text-[#6B7280] ring-[#6B7280]/20'
                  }`}>
                    {event.status}
                  </span>
                  <svg className="w-4 h-4 text-[#6B7280] group-hover:text-[#9CA3AF] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
