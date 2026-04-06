'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatICSDateTime, getInitials } from '@/lib/utils'
import Link from 'next/link'

export default function ReviewPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<any>({})
  const [entries, setEntries] = useState<any[]>([])
  const [reviewer, setReviewer] = useState<any>(null)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: p }, { data: e }, { data: a }, { data: ents }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('assignments').select('*').eq('event_id', eventId),
        supabase.from('activity_entries').select('*').eq('event_id', eventId).order('entry_time'),
      ])

      setReviewer(p)
      setEvent(e)
      setEntries(ents ?? [])

      const aList = a ?? []
      setAssignments(aList)

      // Fetch profiles separately
      const userIds = aList.map((x: any) => x.user_id)
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles').select('*').in('id', userIds)
        const map = (profs ?? []).reduce((acc: any, prof: any) => {
          acc[prof.id] = prof
          return acc
        }, {})
        setProfileMap(map)
      }
    }
    load()
  }, [eventId])

  async function markReviewed(entryId: string) {
    setLoading(entryId)
    const supabase = createClient()
    const { error } = await supabase
      .from('activity_entries')
      .update({
        reviewed: true,
        reviewed_by: reviewer.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', entryId)

    if (!error) {
      setEntries(prev => prev.map(e =>
        e.id === entryId ? { ...e, reviewed: true } : e
      ))
    }
    setLoading(null)
  }

  async function markAllForUser(userId: string) {
    const unreviewed = entries.filter(e => e.user_id === userId && !e.reviewed)
    for (const entry of unreviewed) {
      await markReviewed(entry.id)
    }
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">
          Staff Review
        </p>
        <h1 className="text-xl font-semibold text-zinc-100">{event.name}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {entries.filter(e => e.reviewed).length} of {entries.length} entries reviewed
        </p>
      </div>

      <div className="space-y-6">
        {assignments.map(assignment => {
          const p = profileMap[assignment.user_id]
          const userEntries = entries.filter(e => e.user_id === assignment.user_id)
          const allReviewed = userEntries.length > 0 && userEntries.every(e => e.reviewed)

          return (
            <div key={assignment.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300">
                    {getInitials(p?.full_name ?? '?')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{p?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-zinc-500">{assignment.ics_position}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600">{userEntries.length} entries</span>
                  {allReviewed ? (
                    <span className="text-xs text-green-400 font-mono">✓ Done</span>
                  ) : userEntries.length > 0 ? (
                    <button
                      onClick={() => markAllForUser(assignment.user_id)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                    >
                      Approve all
                    </button>
                  ) : null}
                </div>
              </div>

              {userEntries.length === 0 ? (
                <p className="px-4 py-4 text-sm text-zinc-600">No entries logged.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {userEntries.map(entry => (
                    <div key={entry.id} className="flex gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-orange-400 mb-1">
                          {formatICSDateTime(entry.entry_time)}
                        </p>
                        <p className="text-sm text-zinc-300">{entry.narrative}</p>
                      </div>
                      <div className="flex-shrink-0 pt-1">
                        {entry.reviewed ? (
                          <span className="text-xs text-green-500">✓</span>
                        ) : (
                          <button
                            onClick={() => markReviewed(entry.id)}
                            disabled={loading === entry.id}
                            className="text-xs text-zinc-500 hover:text-green-400 border border-zinc-700 hover:border-green-700 px-2 py-1 rounded transition-colors"
                          >
                            {loading === entry.id ? '...' : 'Review'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {assignments.length === 0 && (
          <p className="text-center text-zinc-600 py-12 text-sm">No personnel assigned to this event.</p>
        )}
      </div>

      <div className="mt-6">
        <Link href={`/events/${eventId}`} className="text-sm text-zinc-600 hover:text-zinc-400">
          ← Back to Event
        </Link>
      </div>
    </div>
  )
}