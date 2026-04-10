'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────

interface NotifRow {
  id: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  event_id: string | null
  meeting_id: string | null
}

interface AlertRow {
  id: string
  title: string
  message: string | null
  severity: 'critical' | 'warning' | 'info'
  created_at: string
  event_id: string
}

interface DisplayItem {
  key: string
  kind: 'meeting' | 'alert' | 'system'
  title: string
  body: string | null
  created_at: string
  event_id: string | null
  meeting_id?: string | null
  severity?: 'critical' | 'warning' | 'info'
  /** true = unread in_app_notifications row that can be marked read */
  notif_id?: string
  is_read?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function severityColor(s?: string) {
  if (s === 'critical') return '#EF4444'
  if (s === 'warning')  return '#F59E0B'
  return '#3B82F6'
}

function KindIcon({ kind, severity, unread }: { kind: DisplayItem['kind']; severity?: string; unread: boolean }) {
  const base = kind === 'alert'
    ? severityColor(severity)
    : unread ? '#FF5A1F' : '#6B7280'

  if (kind === 'meeting') return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: base }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  )
  if (kind === 'alert') return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: base }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: base }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function NotificationBell({ userId }: { userId: string }) {
  const [items,   setItems]   = useState<DisplayItem[]>([])
  const [open,    setOpen]    = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    const supabase = createClient()

    // 1 — Personal notifications (meetings + system messages)
    const { data: notifData } = await supabase
      .from('in_app_notifications')
      .select('id, title, body, is_read, created_at, event_id, meeting_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    const notifItems: DisplayItem[] = (notifData ?? []).map((n: NotifRow) => ({
      key:        `notif-${n.id}`,
      kind:       n.meeting_id ? 'meeting' : 'system',
      title:      n.title,
      body:       n.body,
      created_at: n.created_at,
      event_id:   n.event_id,
      meeting_id: n.meeting_id,
      notif_id:   n.id,
      is_read:    n.is_read,
    }))

    // 2 — Active operational alerts for the user's events
    let alertEventIds: string[] = []
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', userId).single()

    if (prof?.role === 'admin' || prof?.role === 'supervisor') {
      const { data: evts } = await supabase
        .from('events').select('id').eq('status', 'active')
      alertEventIds = (evts ?? []).map((e: any) => e.id)
    } else {
      const { data: asgn } = await supabase
        .from('assignments').select('operational_period_id').eq('user_id', userId)
      const opIds = (asgn ?? []).map((a: any) => a.operational_period_id)
      if (opIds.length > 0) {
        const { data: ops } = await supabase
          .from('operational_periods').select('event_id').in('id', opIds)
        alertEventIds = [...new Set((ops ?? []).map((o: any) => o.event_id))]
      }
    }

    const alertItems: DisplayItem[] = []
    if (alertEventIds.length > 0) {
      const { data: alertData } = await supabase
        .from('event_alerts')
        .select('id, title, message, severity, created_at, event_id')
        .in('event_id', alertEventIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10)

      for (const a of (alertData ?? []) as AlertRow[]) {
        alertItems.push({
          key:        `alert-${a.id}`,
          kind:       'alert',
          title:      a.title,
          body:       a.message,
          created_at: a.created_at,
          event_id:   a.event_id,
          severity:   a.severity,
          is_read:    false, // active alerts are always urgent
        })
      }
    }

    // 3 — Merge and sort newest-first
    const merged = [...alertItems, ...notifItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 30)

    setItems(merged)
  }, [userId])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function handleClick(item: DisplayItem) {
    // Mark personal notification read
    if (item.notif_id) {
      const supabase = createClient()
      await supabase.from('in_app_notifications').update({ is_read: true }).eq('id', item.notif_id)
      setItems(prev => prev.map(x =>
        x.key === item.key ? { ...x, is_read: true } : x
      ))
    }
    setOpen(false)
    if (item.meeting_id && item.event_id) {
      router.push(`/events/${item.event_id}/meetings`)
    } else if (item.event_id) {
      router.push(`/events/${item.event_id}`)
    }
  }

  async function markAllRead() {
    const unreadNotifIds = items
      .filter(i => i.notif_id && !i.is_read)
      .map(i => i.notif_id!)
    if (unreadNotifIds.length === 0) return
    const supabase = createClient()
    await supabase.from('in_app_notifications')
      .update({ is_read: true })
      .in('id', unreadNotifIds)
    setItems(prev => prev.map(i =>
      i.notif_id ? { ...i, is_read: true } : i
    ))
  }

  // Badge = unread notifications + active alert count
  const unreadNotifs  = items.filter(i => i.kind !== 'alert' && !i.is_read).length
  const activeAlerts  = items.filter(i => i.kind === 'alert').length
  const badgeCount    = unreadNotifs + activeAlerts
  const hasUnreadNotifs = unreadNotifs > 0

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        className="relative p-1.5 text-[#6B7280] hover:text-[#E5E7EB] active:scale-90 transition-all duration-150"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {badgeCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none ${
            activeAlerts > 0 ? 'bg-[#EF4444]' : 'bg-[#FF5A1F]'
          }`}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#161D26] border border-[#232B36] rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden animate-entry">

          {/* Header */}
          <div className="px-4 py-3 border-b border-[#232B36] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#E5E7EB]">Notifications</p>
              {activeAlerts > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EF4444]/15 text-[#EF4444]">
                  {activeAlerts} alert{activeAlerts !== 1 ? 's' : ''}
                </span>
              )}
              {unreadNotifs > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF5A1F]/15 text-[#FF5A1F]">
                  {unreadNotifs} new
                </span>
              )}
            </div>
            {hasUnreadNotifs && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors duration-150"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#232B36]/40">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <svg className="w-7 h-7 text-[#2d3748] mx-auto mb-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
                <p className="text-xs font-medium text-[#6B7280]">No notifications</p>
                <p className="text-[11px] text-[#4B5563] mt-0.5">You&apos;re all caught up</p>
              </div>
            ) : (
              items.map(item => {
                const isAlert  = item.kind === 'alert'
                const isUnread = isAlert || !item.is_read
                const sc       = isAlert ? severityColor(item.severity) : undefined

                return (
                  <button
                    key={item.key}
                    onClick={() => handleClick(item)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#1a2235] transition-colors duration-100 ${
                      isAlert
                        ? 'bg-[#EF4444]/[0.03]'
                        : !item.is_read
                        ? 'bg-[#FF5A1F]/[0.03]'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <KindIcon kind={item.kind} severity={item.severity} unread={isUnread} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-semibold leading-snug ${
                            isAlert    ? ''
                            : isUnread ? 'text-[#E5E7EB]'
                                       : 'text-[#9CA3AF]'
                          }`} style={isAlert ? { color: sc } : undefined}>
                            {item.title}
                          </p>
                          {isUnread && !isAlert && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] flex-shrink-0 mt-1" />
                          )}
                          {isAlert && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
                              style={{ color: sc, backgroundColor: `${sc}20` }}
                            >
                              {item.severity}
                            </span>
                          )}
                        </div>
                        {item.body && (
                          <p className="text-[11px] text-[#6B7280] mt-0.5 line-clamp-2 leading-relaxed">
                            {item.body}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-[#4B5563]">{formatTime(item.created_at)}</p>
                          {item.kind === 'meeting' && (
                            <span className="text-[10px] text-[#6B7280] px-1 py-px rounded bg-[#232B36]">Meeting</span>
                          )}
                          {isAlert && (
                            <span className="text-[10px] text-[#6B7280] px-1 py-px rounded bg-[#232B36]">Active alert</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-[#232B36] px-4 py-2">
              <p className="text-[10px] text-[#4B5563] text-center">
                {activeAlerts > 0
                  ? `${activeAlerts} active alert${activeAlerts !== 1 ? 's' : ''} · tap to view event`
                  : `Showing ${items.length} most recent`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
