'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatICSDateTime } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAdminRole } from '@/lib/roles'

type MeetingStatus = 'upcoming' | 'starting_soon' | 'in_progress' | 'completed'

function getMeetingStatus(startIso: string, endIso: string): MeetingStatus {
  const now = Date.now()
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (now >= end) return 'completed'
  if (now >= start) return 'in_progress'
  if (start - now <= 15 * 60_000) return 'starting_soon'
  return 'upcoming'
}

function getCountdown(startIso: string, endIso: string): string {
  const now = Date.now()
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (now >= end) return 'Ended'
  if (now >= start) {
    const mins = Math.ceil((end - now) / 60_000)
    return mins < 60 ? `In progress · ends in ${mins}m` : 'In progress'
  }
  const mins = Math.floor((start - now) / 60_000)
  if (mins === 0) return 'Starting now'
  if (mins < 60) return `Starts in ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem === 0 ? `Starts in ${hrs}h` : `Starts in ${hrs}h ${rem}m`
}

interface Meeting {
  id: string
  title: string
  start_time: string
  end_time: string
  location: string | null
  event_id: string
  event_name: string
  is_cancelled: boolean
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tick, setTick] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const admin = isAdminRole(p?.role)
      setIsAdmin(admin)

      // Fetch all events the user can see
      let eventIds: string[] = []
      if (admin) {
        const { data: evts } = await supabase.from('events').select('id').eq('status', 'active')
        eventIds = (evts ?? []).map((e: any) => e.id)
      } else {
        const { data: invites } = await supabase
          .from('meeting_invitees').select('meeting_id').eq('user_id', user.id)
        const invitedMeetingIds = (invites ?? []).map((i: any) => i.meeting_id)
        if (invitedMeetingIds.length > 0) {
          const { data: mData } = await supabase
            .from('event_meetings')
            .select('id, title, start_time, end_time, location, event_id, is_cancelled')
            .in('id', invitedMeetingIds)
            .eq('is_cancelled', false)
            .order('start_time')
          const evtIds = [...new Set((mData ?? []).map((m: any) => m.event_id))]
          if (evtIds.length > 0) {
            const { data: evts } = await supabase.from('events').select('id, name').in('id', evtIds)
            const evtMap: Record<string, string> = {}
            for (const e of evts ?? []) evtMap[e.id] = e.name
            setMeetings((mData ?? []).map((m: any) => ({ ...m, event_name: evtMap[m.event_id] ?? '' })))
          }
          setLoading(false)
          return
        }
        setLoading(false)
        return
      }

      if (eventIds.length === 0) { setLoading(false); return }

      const { data: evts } = await supabase.from('events').select('id, name').in('id', eventIds)
      const evtMap: Record<string, string> = {}
      for (const e of evts ?? []) evtMap[e.id] = e.name

      const { data: mData } = await supabase
        .from('event_meetings')
        .select('id, title, start_time, end_time, location, event_id, is_cancelled')
        .in('event_id', eventIds)
        .eq('is_cancelled', false)
        .order('start_time')

      setMeetings((mData ?? []).map((m: any) => ({ ...m, event_name: evtMap[m.event_id] ?? '' })))
      setLoading(false)
    }
    load()
  }, [])

  void tick

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  const now = new Date()
  const upcoming = meetings.filter(m => getMeetingStatus(m.start_time, m.end_time) !== 'completed')
  const past = meetings.filter(m => getMeetingStatus(m.start_time, m.end_time) === 'completed')

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        <div className="mb-6">
          <h1 className="text-lg font-semibold text-[#E5E7EB]">Meetings</h1>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {isAdmin ? 'All meetings across active events' : 'Meetings you\'ve been invited to'}
          </p>
        </div>

        {/* Upcoming */}
        <section className="mb-8">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Upcoming</p>
          {upcoming.length === 0 ? (
            <div className="border border-[#232B36] border-dashed rounded-2xl p-10 text-center">
              <svg className="w-9 h-9 text-[#2d3748] mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <p className="text-[#E5E7EB] text-sm font-semibold">No upcoming meetings</p>
              <p className="text-[#6B7280] text-xs mt-1 leading-relaxed">
                {isAdmin
                  ? 'Schedule your first meeting to coordinate your team.'
                  : 'You haven\'t been invited to any meetings yet.'}
              </p>
              {isAdmin && (
                <button
                  onClick={() => router.push('/events')}
                  className="inline-flex items-center gap-1.5 mt-4 bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.97] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Schedule Meeting
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map(m => {
                const status = getMeetingStatus(m.start_time, m.end_time)
                const countdown = getCountdown(m.start_time, m.end_time)
                const isLive = status === 'in_progress'
                const isSoon = status === 'starting_soon'
                return (
                  <Link
                    key={m.id}
                    href={`/events/${m.event_id}/meetings`}
                    className={`block bg-[#161D26] border rounded-2xl px-4 py-3.5 hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150 group ${
                      isLive ? 'border-[#22C55E]/30 hover:border-[#22C55E]/50' : isSoon ? 'border-[#F59E0B]/30 hover:border-[#F59E0B]/50' : 'border-[#232B36] hover:border-[#3a4555]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {isLive && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#22C55E]/15 text-[#22C55E] uppercase tracking-wide animate-pulse">
                              Live
                            </span>
                          )}
                          {isSoon && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] uppercase tracking-wide">
                              Soon
                            </span>
                          )}
                          <span className="text-xs text-[#6B7280] truncate">{m.event_name}</span>
                        </div>
                        <p className="text-sm font-semibold text-[#E5E7EB]">{m.title}</p>
                        <p className="text-xs font-mono text-[#6B7280] mt-0.5">{formatICSDateTime(m.start_time)}</p>
                        {m.location && (
                          <p className="text-xs text-[#6B7280] mt-0.5 truncate">{m.location}</p>
                        )}
                        <p className={`text-[11px] font-medium mt-1 ${
                          isLive ? 'text-[#22C55E]' : isSoon ? 'text-[#F59E0B]' : 'text-[#6B7280]'
                        }`}>{countdown}</p>
                      </div>
                      <svg className="w-4 h-4 text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Past */}
        {past.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Past</p>
            <div className="space-y-2">
              {past.slice().reverse().slice(0, 10).map(m => (
                <Link
                  key={m.id}
                  href={`/events/${m.event_id}/meetings`}
                  className="block bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3 opacity-60 hover:opacity-90 hover:border-[#3a4555] hover:-translate-y-px transition-all duration-150 group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#6B7280] mb-0.5">{m.event_name}</p>
                      <p className="text-sm text-[#9CA3AF]">{m.title}</p>
                      <p className="text-xs font-mono text-[#6B7280]/70 mt-0.5">{formatICSDateTime(m.start_time)}</p>
                    </div>
                    <svg className="w-4 h-4 text-[#232B36] group-hover:text-[#6B7280] transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
