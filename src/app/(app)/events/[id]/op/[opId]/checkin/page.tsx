'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

export default function CheckInPage() {
  const params = useParams()
  const eventId = params.id as string
  const opId    = params.opId as string

  const [op, setOp]           = useState<any>(null)
  const [event, setEvent]     = useState<any>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [checkins, setCheckins] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [saving, setSaving]     = useState<string | null>(null)  // userId being saved

  useEffect(() => { load() }, [opId])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: opData }, { data: evData }, { data: pData }, { data: cData }] =
      await Promise.all([
        supabase.from('operational_periods').select('*').eq('id', opId).single(),
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
        supabase.from('personnel_checkins').select('*').eq('operational_period_id', opId),
      ])

    setCurrentUser(user)
    setOp(opData)
    setEvent(evData)
    setProfiles(pData ?? [])
    setCheckins(cData ?? [])
    setLoading(false)
  }

  async function checkIn(userId: string) {
    if (!currentUser) return
    setSaving(userId)
    const supabase = createClient()
    const { data, error } = await supabase.from('personnel_checkins').upsert({
      operational_period_id: opId,
      event_id: eventId,
      user_id: userId,
      checked_in_at: new Date().toISOString(),
      checked_in_by: currentUser.id,
    }, { onConflict: 'operational_period_id,user_id' }).select().single()
    setSaving(null)
    if (error) return
    if (data) setCheckins(prev => [...prev.filter(c => c.user_id !== userId), data])
  }

  async function undoCheckin(userId: string) {
    setSaving(userId)
    const supabase = createClient()
    await supabase.from('personnel_checkins')
      .delete()
      .eq('operational_period_id', opId)
      .eq('user_id', userId)
    setSaving(null)
    setCheckins(prev => prev.filter(c => c.user_id !== userId))
  }

  const checkinMap = new Map(checkins.map(c => [c.user_id, c]))
  const checkedInCount = checkins.length
  const q = query.toLowerCase()
  const filtered = profiles.filter(p =>
    !q || p.full_name.toLowerCase().includes(q) || (p.default_agency ?? '').toLowerCase().includes(q)
  )

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      {/* Header */}
      <header className="sticky top-12 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        <div className="px-4 py-3 max-w-2xl mx-auto flex items-center gap-3">
          <Link href={`/events/${eventId}/op/${opId}/staff`}
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex-shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Staff
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#E5E7EB] truncate">{event?.name}</p>
            <p className="text-xs text-[#6B7280]">Check-In · OP {op?.period_number}</p>
          </div>
          <span className="text-xs font-mono text-[#22C55E] bg-[#22C55E]/10 px-2 py-1 rounded-lg flex-shrink-0">
            {checkedInCount} in
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-12 max-w-2xl mx-auto w-full">
        {/* Search */}
        <div className="relative mb-4">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or agency…"
            className="w-full bg-[#161D26] border border-[#232B36] text-[#E5E7EB] placeholder-[#374151] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#FF5A1F]/50"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#374151]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={async () => {
              for (const p of profiles) {
                if (!checkinMap.has(p.id)) await checkIn(p.id)
              }
            }}
            className="text-xs text-[#6B7280] border border-[#232B36] px-3 py-1.5 rounded-lg hover:border-[#22C55E]/40 hover:text-[#22C55E] transition-colors"
          >
            Check in all
          </button>
        </div>

        {/* Person list */}
        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden divide-y divide-[#232B36]/60">
          {filtered.length === 0 && (
            <p className="text-sm text-[#6B7280] text-center py-10">No personnel found</p>
          )}
          {filtered.map(p => {
            const checkin = checkinMap.get(p.id)
            const isSaving = saving === p.id
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${checkin ? 'bg-[#22C55E]' : 'bg-[#374151]'}`} />

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-[#121821] border border-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                  {getInitials(p.full_name)}
                </div>

                {/* Name + agency */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#E5E7EB] truncate">{p.full_name}</p>
                  {checkin ? (
                    <p className="text-xs text-[#22C55E] leading-tight mt-px">
                      Checked in {new Date(checkin.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  ) : (
                    <p className="text-xs text-[#4B5563] leading-tight mt-px">{p.default_agency ?? '—'}</p>
                  )}
                </div>

                {/* Action */}
                {checkin ? (
                  <button
                    onClick={() => undoCheckin(p.id)}
                    disabled={isSaving}
                    className="flex-shrink-0 text-xs text-[#4B5563] hover:text-[#EF4444] transition-colors px-2 py-1 rounded"
                  >
                    {isSaving ? '…' : 'Undo'}
                  </button>
                ) : (
                  <button
                    onClick={() => checkIn(p.id)}
                    disabled={isSaving}
                    className="flex-shrink-0 text-xs font-semibold text-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? '…' : 'Check In'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
