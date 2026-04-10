'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Notif {
  id: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  event_id: string | null
  meeting_id: string | null
}

export function NotificationBell({ userId }: { userId: string }) {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open,   setOpen]   = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('in_app_notifications')
      .select('id, title, body, is_read, created_at, event_id, meeting_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25)
    setNotifs((data ?? []) as Notif[])
  }, [userId])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function handleClick(n: Notif) {
    const supabase = createClient()
    await supabase.from('in_app_notifications').update({ is_read: true }).eq('id', n.id)
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    setOpen(false)
    if (n.event_id && n.meeting_id) {
      router.push(`/events/${n.event_id}/meetings`)
    } else if (n.event_id) {
      router.push(`/events/${n.event_id}`)
    }
  }

  async function markAllRead() {
    const unread = notifs.filter(n => !n.is_read)
    if (unread.length === 0) return
    const supabase = createClient()
    await supabase.from('in_app_notifications')
      .update({ is_read: true })
      .in('id', unread.map(n => n.id))
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unread = notifs.filter(n => !n.is_read).length

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        className="relative p-1.5 text-[#6B7280] hover:text-[#E5E7EB] transition-colors"
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#FF5A1F] text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#161D26] border border-[#232B36] rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#232B36] flex items-center justify-between">
            <p className="text-sm font-semibold text-[#E5E7EB]">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-[#232B36]/50">
            {notifs.length === 0 ? (
              <p className="px-4 py-8 text-xs text-[#6B7280] text-center">No notifications yet</p>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-[#1a2235] transition-colors ${
                    !n.is_read ? 'bg-[#FF5A1F]/[0.04]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.is_read ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] flex-shrink-0 mt-[5px]" />
                    ) : (
                      <span className="w-1.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold leading-snug ${
                        n.is_read ? 'text-[#9CA3AF]' : 'text-[#E5E7EB]'
                      }`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2 leading-relaxed">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-[#4B5563] mt-1">
                        {new Date(n.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
