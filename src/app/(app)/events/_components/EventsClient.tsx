'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialEvents: any[]
  initialOps:    any[]
  isAdmin:       boolean
}

export function EventsClient({ initialEvents, initialOps, isAdmin }: Props) {
  const [events, setEvents]       = useState<any[]>(initialEvents)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting]   = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    const supabase = createClient()
    const { error } = await supabase.from('events').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { setDeleteError(error.message); return }
    setEvents(prev => prev.filter(e => e.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  if (events.length === 0) {
    return (
      <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-12 text-center">
        <p className="text-[#6B7280] text-sm">No events yet.</p>
        {isAdmin && (
          <Link href="/events/new"
            className="inline-block mt-4 text-[#FF5A1F] text-sm hover:text-[#FF6A33] transition-colors">
            Create the first event →
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2" ref={menuRef}>
        {events.map((event: any) => {
          const eventOps  = initialOps.filter((op: any) => op.event_id === event.id)
          const activeOps = eventOps.filter((op: any) => op.status === 'active')
          const isActive  = event.status === 'active'
          const menuOpen  = openMenuId === event.id

          return (
            <div key={event.id} className="relative">
              {/* Card — navigates on click */}
              <Link
                href={`/events/${event.id}`}
                className={`block bg-[#161D26] border rounded-2xl px-4 py-4 hover:bg-[#1a2235] hover:-translate-y-px hover:shadow-lg hover:shadow-black/25 transition-all duration-150 group ${
                  isActive ? 'border-[#22C55E]/20 hover:border-[#22C55E]/40' : 'border-[#232B36] hover:border-[#3a4555]'
                } ${isAdmin ? 'pr-11' : ''}`}
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
                  {!isAdmin && (
                    <svg className="w-4 h-4 text-[#2d3748] group-hover:text-[#6B7280] transition-colors duration-150 flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  )}
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

              {/* Admin action menu — outside Link so clicks don't navigate */}
              {isAdmin && (
                <div className="absolute top-3 right-3 z-10">
                  <button
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenMenuId(menuOpen ? null : event.id)
                    }}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors touch-manipulation text-lg leading-none ${
                      menuOpen
                        ? 'bg-[#232B36] text-[#E5E7EB]'
                        : 'text-[#374151] hover:text-[#9CA3AF] hover:bg-[#232B36]'
                    }`}
                    title="Actions"
                    aria-label="Event actions"
                  >
                    ⋮
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-9 w-44 bg-[#161D26] border border-[#232B36] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-20">
                      <Link
                        href={`/events/${event.id}`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1a2235] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        Open Event
                      </Link>
                      <Link
                        href={`/events/${event.id}/edit`}
                        onClick={() => setOpenMenuId(null)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1a2235] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Edit Event
                      </Link>
                      <div className="border-t border-[#232B36]/60 my-0.5" />
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setOpenMenuId(null)
                          setDeleteTarget(event)
                          setDeleteError(null)
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#EF4444] hover:bg-red-500/10 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                        Delete Event
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!deleting) setDeleteTarget(null) }}
        >
          <div
            className="bg-[#161D26] border border-[#232B36] rounded-2xl w-full max-w-sm p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-[#EF4444]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>

            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-[#E5E7EB]">Delete Event?</p>
              <p className="text-sm text-[#9CA3AF]">
                <span className="text-[#E5E7EB] font-medium">{deleteTarget.name}</span>
              </p>
              <p className="text-xs text-[#6B7280] pt-1">
                This will permanently delete the event and all associated data. This action cannot be undone.
              </p>
            </div>

            {deleteError && (
              <p className="text-xs text-[#EF4444] text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-[#9CA3AF] bg-[#121821] border border-[#232B36] hover:border-[#3a4555] hover:text-[#E5E7EB] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : null}
                {deleting ? 'Deleting…' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
