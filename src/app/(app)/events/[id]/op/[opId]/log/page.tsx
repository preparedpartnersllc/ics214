'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSDateTime } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import Link from 'next/link'

// Relative time — recalculated on every render tick
function getRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr  = Math.floor(diffMin / 60)
  if (diffSec < 45) return 'Just now'
  if (diffMin < 2)  return '1 min ago'
  if (diffMin < 60) return `${diffMin} mins ago`
  if (diffHr === 1) return '1 hr ago'
  if (diffHr < 24)  return `${diffHr} hrs ago`
  return ''  // older entries: show only the ICS timestamp
}

export default function LogPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId = params.opId as string

  const [op, setOp] = useState<any>(null)
  const [event, setEvent] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [narrative, setNarrative] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notAssigned, setNotAssigned] = useState(false)
  const [newEntryId, setNewEntryId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)

  // Force re-render every 30s so relative times stay accurate
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: p }, { data: e }, { data: o }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('operational_periods').select('*').eq('id', opId).single(),
    ])

    const { data: a } = await supabase
      .from('assignments')
      .select('*')
      .eq('operational_period_id', opId)
      .eq('user_id', user.id)
      .single()

    if (!a) { setNotAssigned(true); return }

    const { data: ents } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('assignment_id', a.id)
      .order('entry_time', { ascending: false })

    setProfile(p)
    setEvent(e)
    setOp(o)
    setAssignment(a)
    setEntries(ents ?? [])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = narrative.trim()
    if (trimmed.length < 3) {
      setValidationError('Describe the activity (at least 3 characters)')
      textareaRef.current?.focus()
      return
    }

    setSubmitting(true)
    setValidationError(null)
    setSubmitError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !assignment) { setSubmitting(false); return }

    const { data: entry, error: err } = await supabase
      .from('activity_entries')
      .insert({
        operational_period_id: opId,
        assignment_id: assignment.id,
        user_id: user.id,
        entry_time: new Date().toISOString(),
        narrative: trimmed,
      })
      .select()
      .single()

    if (err) { setSubmitError(err.message); setSubmitting(false); return }

    setEntries(prev => [entry, ...prev])
    setNarrative('')
    setNewEntryId(entry.id)
    setTimeout(() => setNewEntryId(null), 1500)
    setSubmitting(false)
    setTimeout(() => textareaRef.current?.focus(), 0)

    // Toast feedback
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2500)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e as any)
    }
  }

  async function deleteEntry(id: string) {
    const supabase = createClient()
    await supabase.from('activity_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setPendingDeleteId(null)
  }

  function handleDeleteTap(id: string) {
    if (pendingDeleteId === id) {
      deleteEntry(id)
    } else {
      setPendingDeleteId(id)
      setTimeout(() => setPendingDeleteId(prev => prev === id ? null : prev), 3000)
    }
  }

  if (notAssigned) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-zinc-400 mb-4">You are not assigned to this operational period.</p>
        <Link href={`/events/${eventId}`} className="text-orange-500 text-sm hover:text-orange-400 transition-colors">
          ← Back to Event
        </Link>
      </div>
    </div>
  )

  if (!assignment) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 text-sm">Loading...</p>
    </div>
  )

  const canSubmit = narrative.trim().length >= 3

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── STICKY CONTEXT HEADER ─────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/70">
        <div className="px-4 py-2.5 sm:py-3 max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-orange-500 tracking-wide">ICS 214</span>
              <span className="text-zinc-700 text-xs">·</span>
              <span className="text-sm font-semibold text-zinc-100 truncate">{event?.name}</span>
            </div>
            <p className="hidden sm:block text-xs text-zinc-500 mt-0.5">
              OP {op?.period_number}
              <span className="text-zinc-700 mx-1.5">·</span>
              {getPositionLabel(assignment?.ics_position)}
              <span className="text-zinc-700 mx-1.5">·</span>
              <span className="text-zinc-400">{profile?.full_name}</span>
            </p>
          </div>
          <Link
            href={`/events/${eventId}`}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </Link>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <main className="flex-1 px-4 pt-4 sm:pt-6 pb-8 max-w-2xl mx-auto w-full">

        {/* PRIMARY INPUT AREA */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className={`bg-zinc-900 border rounded-xl overflow-hidden transition-all duration-150 ${
            validationError
              ? 'border-red-700/60 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]'
              : 'border-zinc-600 focus-within:border-orange-500 focus-within:shadow-[0_0_0_3px_rgba(234,88,12,0.18)]'
          }`}>
            <textarea
              ref={textareaRef}
              value={narrative}
              onChange={e => { setNarrative(e.target.value); if (validationError) setValidationError(null) }}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder="What happened, what was assigned, completed, or communicated?"
              className="w-full bg-transparent px-4 pt-4 pb-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none resize-none leading-relaxed"
              autoFocus
            />
            <div className="border-t border-zinc-800 px-3 py-3 sm:px-4 sm:py-2.5 sm:flex sm:items-center sm:justify-between gap-3">
              <span className="hidden sm:block text-xs text-zinc-600 select-none">
                {narrative.trim().length > 0
                  ? `${narrative.length} chars`
                  : <><kbd className="font-mono bg-zinc-800 px-1 py-0.5 rounded text-zinc-500">⌘</kbd> <kbd className="font-mono bg-zinc-800 px-1 py-0.5 rounded text-zinc-500">↵</kbd> to submit</>
                }
              </span>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 active:scale-[0.96] disabled:opacity-35 disabled:pointer-events-none text-white px-4 py-3 sm:py-2 rounded-lg text-sm font-semibold transition-all shadow-sm"
              >
                {submitting ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                )}
                Log Entry
              </button>
            </div>
          </div>

          {validationError && (
            <p className="text-xs text-red-400 mt-2 px-1 flex items-center gap-1.5">
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              {validationError}
            </p>
          )}
          {submitError && (
            <p className="text-xs text-red-400 mt-2 px-1">{submitError}</p>
          )}
        </form>

        {/* ACTIVITY TIMELINE */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Activity Timeline
            </p>
            <span className="text-xs font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 rounded-full tabular-nums">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <p className="text-sm text-zinc-500">No activity logged yet.</p>
              <p className="text-xs text-zinc-600 mt-1">Start by adding your first entry above.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-zinc-800" />

              <div className="space-y-0">
                {entries.map(entry => {
                  const isPending = pendingDeleteId === entry.id
                  const relTime = getRelativeTime(entry.entry_time)
                  return (
                    <div
                      key={entry.id}
                      className={`relative flex gap-4 pb-6 group ${newEntryId === entry.id ? 'animate-entry' : ''}`}
                    >
                      {/* Timeline dot — w-2.5 = 10px, center at 5px, aligns with left-[5px] line */}
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 relative z-10 transition-colors ring-1 ${
                        entry.reviewed
                          ? 'bg-green-500/60 ring-green-500/30'
                          : newEntryId === entry.id
                          ? 'bg-orange-500 ring-orange-500/40'
                          : 'bg-zinc-700 ring-zinc-600'
                      }`} />

                      {/* Entry content */}
                      <div className="flex-1 min-w-0">

                        {/* Time row */}
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {relTime ? (
                              <>
                                <span className="text-xs font-semibold text-zinc-300">{relTime}</span>
                                <time className="text-xs font-mono text-orange-400/70">
                                  {formatICSDateTime(entry.entry_time)}
                                </time>
                              </>
                            ) : (
                              <time className="text-xs font-mono text-orange-400 font-medium">
                                {formatICSDateTime(entry.entry_time)}
                              </time>
                            )}
                          </div>

                          {entry.reviewed ? (
                            <span className="flex items-center gap-1 text-xs text-green-500/80 flex-shrink-0">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M20 6L9 17l-5-5"/>
                              </svg>
                              Reviewed
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDeleteTap(entry.id)}
                              title={isPending ? 'Tap again to confirm delete' : 'Delete entry'}
                              className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all touch-manipulation ${
                                isPending
                                  ? 'bg-red-900/50 text-red-400 ring-1 ring-red-700/50'
                                  : 'text-zinc-700 hover:text-zinc-500 opacity-40 hover:opacity-100'
                              }`}
                            >
                              {isPending ? (
                                <>
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                  </svg>
                                  Confirm
                                </>
                              ) : (
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Narrative */}
                        <p className="text-sm text-zinc-300 leading-relaxed">{entry.narrative}</p>

                        {/* Author */}
                        <p className="text-xs text-zinc-600 mt-1.5">{profile?.full_name}</p>

                        {/* Inline delete confirmation */}
                        {isPending && (
                          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-800">
                            <span className="text-xs text-red-400/90">Delete this entry?</span>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                            >
                              Yes, delete
                            </button>
                            <button
                              onClick={() => setPendingDeleteId(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── SUCCESS TOAST ─────────────────────────────────────── */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 z-50 pointer-events-none animate-toast">
          <div className="flex items-center gap-2.5 bg-zinc-900 border border-zinc-600 text-zinc-100 text-sm font-medium px-5 py-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] whitespace-nowrap">
            <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </span>
            Entry logged
          </div>
        </div>
      )}

    </div>
  )
}
