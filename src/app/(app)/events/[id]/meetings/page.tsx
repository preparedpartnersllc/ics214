'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isAdminRole } from '@/lib/roles'
import { formatICSDateTime } from '@/lib/utils'
import { getPositionLabel } from '@/lib/ics-positions'
import type { EventMeeting, MeetingRsvpStatus } from '@/types'

// -- Meeting status helpers ------------------------------------

type MeetingStatus = 'upcoming' | 'starting_soon' | 'in_progress' | 'completed' | 'cancelled'

function getMeetingStatus(m: EventMeeting): MeetingStatus {
  if (m.is_cancelled) return 'cancelled'
  const now = Date.now()
  const start = new Date(m.start_time).getTime()
  const end   = new Date(m.end_time).getTime()
  if (now >= end)                    return 'completed'
  if (now >= start)                  return 'in_progress'
  if (start - now <= 15 * 60_000)   return 'starting_soon'
  return 'upcoming'
}

function getCountdown(m: EventMeeting): string {
  const now   = Date.now()
  const start = new Date(m.start_time).getTime()
  const end   = new Date(m.end_time).getTime()
  if (now >= end) return 'Ended'
  if (now >= start) {
    const mins = Math.ceil((end - now) / 60_000)
    return mins < 60 ? `In progress · ends in ${mins}m` : 'In progress'
  }
  const diff = start - now
  const mins = Math.floor(diff / 60_000)
  if (mins === 0) return 'Starting now'
  if (mins < 60)  return `Starts in ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem === 0 ? `Starts in ${hrs}h` : `Starts in ${hrs}h ${rem}m`
}

const STATUS_STYLE: Record<MeetingStatus, { label: string; badge: string; border: string; countdown: string }> = {
  upcoming:      { label: 'Upcoming',      badge: 'text-[#6B7280] bg-[#232B36]/80',              border: 'border-[#232B36]',        countdown: 'text-[#6B7280]' },
  starting_soon: { label: 'Starting Soon', badge: 'text-[#F59E0B] bg-[#F59E0B]/15 animate-pulse', border: 'border-[#F59E0B]/30',     countdown: 'text-[#F59E0B]' },
  in_progress:   { label: 'In Progress',   badge: 'text-[#22C55E] bg-[#22C55E]/15',              border: 'border-[#22C55E]/30',     countdown: 'text-[#22C55E]' },
  completed:     { label: 'Completed',     badge: 'text-[#6B7280] bg-[#232B36]/80',              border: 'border-[#232B36]',        countdown: 'text-[#6B7280]' },
  cancelled:     { label: 'Cancelled',     badge: 'text-[#EF4444] bg-[#EF4444]/15',              border: 'border-[#EF4444]/20',     countdown: 'text-[#EF4444]' },
}

const RSVP_STYLE: Record<MeetingRsvpStatus, { label: string; active: string }> = {
  accepted: { label: 'Accept',  active: 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30' },
  maybe:    { label: 'Maybe',   active: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30' },
  declined: { label: 'Decline', active: 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30' },
}

// -- Date helpers ----------------------------------------------

function toDatetimeLocal(iso: string) {
  const d   = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nowPlusMins(mins: number) {
  const d   = new Date(Date.now() + mins * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// -- Page -----------------------------------------------------

export default function MeetingsPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [profile,       setProfile]       = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [event,         setEvent]         = useState<any>(null)
  const [meetings,      setMeetings]      = useState<EventMeeting[]>([])
  const [participants,  setParticipants]  = useState<any[]>([])
  const [inviteeMap,    setInviteeMap]    = useState<Record<string, string[]>>({})
  // Non-admin: my RSVPs per meeting_id
  const [myRsvps,       setMyRsvps]       = useState<Record<string, MeetingRsvpStatus>>({})
  // Admin: counts per meeting_id → { accepted: n, maybe: n, declined: n }
  const [rsvpCounts,    setRsvpCounts]    = useState<Record<string, Record<string, number>>>({})
  const [loading,       setLoading]       = useState(true)
  // Increments every 30 s to re-render countdowns
  const [tick,          setTick]          = useState(0)

  // Create-form state
  const [showForm,  setShowForm]  = useState(false)
  const [fTitle,    setFTitle]    = useState('')
  const [fDesc,     setFDesc]     = useState('')
  const [fLocation, setFLocation] = useState('')
  const [fStart,    setFStart]    = useState(nowPlusMins(60))
  const [fEnd,      setFEnd]      = useState(nowPlusMins(120))
  const [fInvitees, setFInvitees] = useState<string[]>([])
  const [fSaving,   setFSaving]   = useState(false)
  const [fError,    setFError]    = useState<string | null>(null)

  const isAdmin = isAdminRole(profile?.role)

  // Countdown ticker
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCurrentUserId(user.id)

    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('events').select('*').eq('id', id).single(),
    ])
    setProfile(p)
    setEvent(e)

    // Load all meetings for this event
    const { data: mData } = await supabase
      .from('event_meetings')
      .select('*')
      .eq('event_id', id)
      .order('start_time')
    const allMeetings = (mData ?? []) as EventMeeting[]

    // Filter by invite for non-admins
    let visibleMeetings: EventMeeting[]
    if (!isAdminRole(p?.role)) {
      const { data: invites } = await supabase
        .from('meeting_invitees').select('meeting_id').eq('user_id', user.id)
      const ids = new Set((invites ?? []).map((i: any) => i.meeting_id))
      visibleMeetings = allMeetings.filter(m => ids.has(m.id) && !m.is_cancelled)
    } else {
      visibleMeetings = allMeetings
    }
    setMeetings(visibleMeetings)

    const mids = allMeetings.map(m => m.id)
    if (mids.length > 0) {
      // Invitee map
      const { data: invData } = await supabase
        .from('meeting_invitees').select('meeting_id, user_id').in('meeting_id', mids)
      const iMap: Record<string, string[]> = {}
      for (const row of invData ?? []) {
        if (!iMap[row.meeting_id]) iMap[row.meeting_id] = []
        iMap[row.meeting_id].push(row.user_id)
      }
      setInviteeMap(iMap)

      // RSVPs
      const { data: rsvpData } = await supabase
        .from('meeting_rsvps').select('meeting_id, user_id, status').in('meeting_id', mids)

      if (!isAdminRole(p?.role)) {
        const myMap: Record<string, MeetingRsvpStatus> = {}
        for (const r of (rsvpData ?? []).filter((r: any) => r.user_id === user.id)) {
          myMap[r.meeting_id] = r.status as MeetingRsvpStatus
        }
        setMyRsvps(myMap)
      } else {
        const counts: Record<string, Record<string, number>> = {}
        for (const r of rsvpData ?? []) {
          if (!counts[r.meeting_id]) counts[r.meeting_id] = {}
          counts[r.meeting_id][r.status] = (counts[r.meeting_id][r.status] ?? 0) + 1
        }
        setRsvpCounts(counts)
      }
    }

    // Participants (admin only — for invitee selector)
    if (isAdminRole(p?.role)) {
      const { data: ops } = await supabase
        .from('operational_periods').select('id').eq('event_id', id)
      const opIds = (ops ?? []).map((o: any) => o.id)
      if (opIds.length > 0) {
        const { data: asgns } = await supabase
          .from('assignments').select('user_id, ics_position').in('operational_period_id', opIds)
        const posMap: Record<string, string> = {}
        for (const a of asgns ?? []) {
          if (!posMap[a.user_id]) posMap[a.user_id] = a.ics_position
        }
        const uids = Object.keys(posMap)
        if (uids.length > 0) {
          const { data: profs } = await supabase
            .from('profiles').select('id, full_name, phone_normalized, phone')
            .in('id', uids).order('full_name')
          setParticipants((profs ?? []).map((pr: any) => ({
            ...pr, ics_position: posMap[pr.id] ?? null,
          })))
        }
      }
    }

    // Mark event notifications as read
    await supabase
      .from('in_app_notifications')
      .update({ is_read: true })
      .eq('user_id', user.id).eq('event_id', id).eq('is_read', false)

    setLoading(false)
  }

  // -- RSVP submit ----------------------------------------------

  async function submitRSVP(meetingId: string, status: MeetingRsvpStatus) {
    if (!currentUserId) return
    const supabase = createClient()
    await supabase.from('meeting_rsvps').upsert({
      meeting_id: meetingId,
      user_id:    currentUserId,
      status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meeting_id,user_id' })
    setMyRsvps(prev => ({ ...prev, [meetingId]: status }))
  }

  // -- Create meeting -------------------------------------------

  async function createMeeting(ev: React.FormEvent) {
    ev.preventDefault()
    if (!fTitle.trim() || !fStart || !fEnd) return
    if (new Date(fEnd) <= new Date(fStart)) { setFError('End time must be after start time'); return }
    setFSaving(true); setFError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFSaving(false); return }

    const { data: mtg, error } = await supabase
      .from('event_meetings')
      .insert({
        event_id:    id,
        title:       fTitle.trim(),
        description: fDesc.trim() || null,
        location:    fLocation.trim() || null,
        start_time:  new Date(fStart).toISOString(),
        end_time:    new Date(fEnd).toISOString(),
        created_by:  user.id,
      })
      .select().single()

    if (error) { setFError(error.message); setFSaving(false); return }

    if (fInvitees.length > 0) {
      await supabase.from('meeting_invitees').insert(
        fInvitees.map(uid => ({ meeting_id: mtg.id, user_id: uid }))
      )
      await supabase.from('in_app_notifications').insert(
        fInvitees.map(uid => ({
          user_id: uid, event_id: id, meeting_id: mtg.id,
          title: 'Meeting scheduled',
          body: `${mtg.title} — ${formatICSDateTime(mtg.start_time)}${mtg.location ? ' @ ' + mtg.location : ''}`,
        }))
      )
      // SMS dispatch (server-side, non-blocking)
      fetch(`/api/events/${id}/meetings/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: mtg.id, targetUserIds: fInvitees }),
      }).catch(() => {})
    }

    setMeetings(prev =>
      [...prev, mtg as EventMeeting].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    )
    setInviteeMap(prev => ({ ...prev, [mtg.id]: fInvitees }))
    resetForm()
    setFSaving(false)
  }

  function resetForm() {
    setShowForm(false)
    setFTitle(''); setFDesc(''); setFLocation('')
    setFStart(nowPlusMins(60)); setFEnd(nowPlusMins(120))
    setFInvitees([]); setFError(null)
  }

  async function cancelMeeting(mid: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('event_meetings').update({ is_cancelled: true }).eq('id', mid)
    if (!error) setMeetings(prev => prev.map(m => m.id === mid ? { ...m, is_cancelled: true } : m))
  }

  function handleMeetingSaved(updated: EventMeeting, newInviteeIds: string[]) {
    setMeetings(prev =>
      prev.map(m => m.id === updated.id ? updated : m)
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    )
    setInviteeMap(prev => ({ ...prev, [updated.id]: newInviteeIds }))
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  // tick is referenced here so React re-renders this component (and children) every 30 s
  void tick
  const active    = meetings.filter(m => { const s = getMeetingStatus(m); return s === 'upcoming' || s === 'starting_soon' || s === 'in_progress' })
  const past      = meetings.filter(m => getMeetingStatus(m) === 'completed')
  const cancelled = meetings.filter(m => m.is_cancelled)

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">

      {/* -- HEADER ------------------------------------------- */}
      <header className="sticky top-12 z-20 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
        <div className="px-4 py-2.5 max-w-2xl mx-auto flex items-center justify-between gap-4">
          <Link
            href={`/events/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            {event?.name}
          </Link>
          <p className="text-sm font-semibold text-[#E5E7EB]">Meetings</p>
        </div>
      </header>

      {/* -- BODY --------------------------------------------- */}
      <main className="flex-1 px-4 pt-6 pb-24 max-w-2xl mx-auto w-full">

        {/* Admin toolbar */}
        {isAdmin && (
          <div className="mb-6 flex items-center justify-between">
            <p className="text-xs text-[#6B7280]">
              {active.length} upcoming · {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1.5 bg-[#FF5A1F] hover:bg-[#FF6A33] text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Schedule Meeting
            </button>
          </div>
        )}

        {/* -- CREATE FORM ----------------------------------- */}
        {isAdmin && showForm && (
          <div className="mb-8 bg-[#161D26] border border-[#FF5A1F]/20 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[#E5E7EB]">New Meeting</p>
              <button onClick={resetForm} className="text-[#6B7280] hover:text-[#E5E7EB] p-1 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={createMeeting} className="space-y-4">
              <Field label="Title *">
                <input className="input" placeholder="e.g. Morning Briefing" value={fTitle}
                  onChange={e => setFTitle(e.target.value)} required autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start *">
                  <input className="input" type="datetime-local" value={fStart}
                    onChange={e => setFStart(e.target.value)} required />
                </Field>
                <Field label="End *">
                  <input className="input" type="datetime-local" value={fEnd}
                    onChange={e => setFEnd(e.target.value)} required />
                </Field>
              </div>
              <Field label="Location">
                <input className="input" placeholder="e.g. Command Post, Room 3" value={fLocation}
                  onChange={e => setFLocation(e.target.value)} />
              </Field>
              <Field label="Notes">
                <textarea className="input resize-none" rows={2} placeholder="Optional agenda or notes…"
                  value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </Field>
              <InviteeSelector participants={participants} selected={fInvitees} onChange={setFInvitees} />
              {fError && <p className="text-xs text-[#EF4444]">{fError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={fSaving || !fTitle.trim()}
                  className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  {fSaving ? 'Scheduling…' : `Schedule${fInvitees.length > 0 ? ` · ${fInvitees.length} invited` : ''}`}
                </button>
                <button type="button" onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl border border-[#232B36] text-[#9CA3AF] text-sm hover:bg-[#1a2235] transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* -- ACTIVE / UPCOMING ---------------------------- */}
        {active.length > 0 && (
          <section className="mb-8">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Upcoming</p>
            <div className="space-y-3">
              {active.map(mtg => (
                <MeetingCard
                  key={mtg.id}
                  meeting={mtg}
                  inviteeIds={inviteeMap[mtg.id] ?? []}
                  participants={participants}
                  isAdmin={isAdmin}
                  eventId={id}
                  myRsvp={myRsvps[mtg.id] ?? null}
                  onRsvp={status => submitRSVP(mtg.id, status)}
                  rsvpCounts={rsvpCounts[mtg.id]}
                  onCancel={() => cancelMeeting(mtg.id)}
                  onSave={handleMeetingSaved}
                />
              ))}
            </div>
          </section>
        )}

        {/* -- PAST ----------------------------------------- */}
        {past.length > 0 && (
          <section className="mb-8">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Past</p>
            <div className="space-y-3">
              {past.slice().reverse().map(mtg => (
                <MeetingCard
                  key={mtg.id}
                  meeting={mtg}
                  inviteeIds={inviteeMap[mtg.id] ?? []}
                  participants={participants}
                  isAdmin={false}
                  eventId={id}
                  myRsvp={myRsvps[mtg.id] ?? null}
                  onRsvp={() => {}}
                  dimmed
                  onCancel={() => {}}
                />
              ))}
            </div>
          </section>
        )}

        {/* -- CANCELLED (admin only) ------------------------ */}
        {isAdmin && cancelled.length > 0 && (
          <section className="mb-8">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Cancelled</p>
            <div className="space-y-2">
              {cancelled.map(mtg => (
                <div key={mtg.id} className="bg-[#161D26] border border-[#232B36] rounded-2xl px-4 py-3 opacity-50">
                  <p className="text-sm text-[#6B7280] line-through">{mtg.title}</p>
                  <p className="text-xs font-mono text-[#6B7280]/60">{formatICSDateTime(mtg.start_time)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* -- EMPTY STATE ----------------------------------- */}
        {meetings.length === 0 && !showForm && (
          <div className="border border-[#232B36] border-dashed rounded-2xl p-10 text-center">
            <p className="text-[#6B7280] text-sm">No meetings scheduled.</p>
            {isAdmin && (
              <button onClick={() => setShowForm(true)} className="mt-3 text-[#FF5A1F] text-sm hover:underline">
                Schedule the first meeting →
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// -- Meeting card ---------------------------------------------

function MeetingCard({
  meeting, inviteeIds, participants, isAdmin, eventId,
  myRsvp, onRsvp, rsvpCounts,
  onCancel, onSave, dimmed = false,
}: {
  meeting: EventMeeting
  inviteeIds: string[]
  participants: any[]
  isAdmin: boolean
  eventId: string
  myRsvp: MeetingRsvpStatus | null
  onRsvp: (s: MeetingRsvpStatus) => void
  rsvpCounts?: Record<string, number>
  onCancel: () => void
  onSave?: (updated: EventMeeting, newInviteeIds: string[]) => void
  dimmed?: boolean
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [eTitle,    setETitle]    = useState('')
  const [eDesc,     setEDesc]     = useState('')
  const [eLocation, setELocation] = useState('')
  const [eStart,    setEStart]    = useState('')
  const [eEnd,      setEEnd]      = useState('')
  const [eInvitees, setEInvitees] = useState<string[]>([])
  const [eSaving,   setESaving]   = useState(false)
  const [eError,    setEError]    = useState<string | null>(null)

  const status     = getMeetingStatus(meeting)
  const countdown  = getCountdown(meeting)
  const cfg        = STATUS_STYLE[status]
  const invitees   = participants.filter(p => inviteeIds.includes(p.id))
  const showRsvp   = !isAdmin && !dimmed &&
                     (status === 'upcoming' || status === 'starting_soon' || status === 'in_progress')

  function openEdit() {
    setETitle(meeting.title)
    setEDesc(meeting.description ?? '')
    setELocation(meeting.location ?? '')
    setEStart(toDatetimeLocal(meeting.start_time))
    setEEnd(toDatetimeLocal(meeting.end_time))
    setEInvitees([...inviteeIds])
    setEError(null)
    setEditing(true)
  }

  async function saveEdit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!eTitle.trim() || !eStart || !eEnd) return
    if (new Date(eEnd) <= new Date(eStart)) { setEError('End time must be after start time'); return }
    setESaving(true); setEError(null)

    const supabase = createClient()
    const { data: updated, error } = await supabase
      .from('event_meetings')
      .update({
        title:       eTitle.trim(),
        description: eDesc.trim() || null,
        location:    eLocation.trim() || null,
        start_time:  new Date(eStart).toISOString(),
        end_time:    new Date(eEnd).toISOString(),
      })
      .eq('id', meeting.id)
      .select().single()

    if (error) { setEError(error.message); setESaving(false); return }

    const prevSet    = new Set(inviteeIds)
    const newlyAdded = eInvitees.filter(uid => !prevSet.has(uid))

    await supabase.from('meeting_invitees').delete().eq('meeting_id', meeting.id)
    if (eInvitees.length > 0) {
      await supabase.from('meeting_invitees').insert(
        eInvitees.map(uid => ({ meeting_id: meeting.id, user_id: uid }))
      )
    }

    if (newlyAdded.length > 0) {
      const u = updated as EventMeeting
      await supabase.from('in_app_notifications').insert(
        newlyAdded.map(uid => ({
          user_id: uid, event_id: eventId, meeting_id: meeting.id,
          title: 'Meeting scheduled',
          body: `${u.title} — ${formatICSDateTime(u.start_time)}${u.location ? ' @ ' + u.location : ''}`,
        }))
      )
      fetch(`/api/events/${eventId}/meetings/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id, targetUserIds: newlyAdded }),
      }).catch(() => {})
    }

    setEditing(false); setESaving(false)
    onSave?.(updated as EventMeeting, eInvitees)
  }

  // -- Edit view ----------------------------------------------
  if (editing) {
    return (
      <div className="bg-[#161D26] border border-[#FF5A1F]/25 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[#E5E7EB]">Edit Meeting</p>
          <button onClick={() => setEditing(false)} className="text-[#6B7280] hover:text-[#E5E7EB] p-1 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Title *">
            <input className="input" value={eTitle} onChange={e => setETitle(e.target.value)} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start *">
              <input className="input" type="datetime-local" value={eStart} onChange={e => setEStart(e.target.value)} required />
            </Field>
            <Field label="End *">
              <input className="input" type="datetime-local" value={eEnd} onChange={e => setEEnd(e.target.value)} required />
            </Field>
          </div>
          <Field label="Location">
            <input className="input" placeholder="e.g. Command Post" value={eLocation}
              onChange={e => setELocation(e.target.value)} />
          </Field>
          <Field label="Notes">
            <textarea className="input resize-none" rows={2} value={eDesc}
              onChange={e => setEDesc(e.target.value)} />
          </Field>
          <InviteeSelector participants={participants} selected={eInvitees} onChange={setEInvitees} />
          {eError && <p className="text-xs text-[#EF4444]">{eError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={eSaving || !eTitle.trim()}
              className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {eSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="px-4 py-2.5 rounded-xl border border-[#232B36] text-[#9CA3AF] text-sm hover:bg-[#1a2235] transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    )
  }

  // -- Normal view --------------------------------------------
  return (
    <div className={`bg-[#161D26] border ${cfg.border} rounded-2xl overflow-hidden ${dimmed ? 'opacity-60' : ''}`}>
      <div className="px-4 py-3.5">

        {/* Title row with status badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-[#E5E7EB] leading-snug">{meeting.title}</p>
            <p className="text-xs font-mono text-[#FF5A1F]/80 mt-0.5">{formatICSDateTime(meeting.start_time)}</p>
            {/* Countdown */}
            {!dimmed && status !== 'completed' && status !== 'cancelled' && (
              <p className={`text-xs font-medium mt-0.5 ${cfg.countdown}`}>{countdown}</p>
            )}
            {meeting.location && (
              <p className="text-xs text-[#6B7280] mt-1 flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span className="truncate">{meeting.location}</span>
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
            {inviteeIds.length > 0 && (
              <button onClick={() => setExpanded(v => !v)}
                className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors">
                {inviteeIds.length} {inviteeIds.length === 1 ? 'person' : 'people'}
              </button>
            )}
            {isAdmin && (
              <>
                <button onClick={openEdit} className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors">
                  Edit
                </button>
                <button onClick={onCancel} className="text-xs text-[#EF4444]/50 hover:text-[#EF4444] transition-colors">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notes */}
        {meeting.description && (
          <p className="text-xs text-[#6B7280] mt-2 leading-relaxed line-clamp-2">{meeting.description}</p>
        )}

        {/* Admin: RSVP counts */}
        {isAdmin && rsvpCounts && Object.keys(rsvpCounts).length > 0 && (
          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
            {(rsvpCounts.accepted ?? 0) > 0 && (
              <span className="text-[10px] font-medium text-[#22C55E]">✓ {rsvpCounts.accepted} accepted</span>
            )}
            {(rsvpCounts.maybe ?? 0) > 0 && (
              <span className="text-[10px] font-medium text-[#F59E0B]">? {rsvpCounts.maybe} maybe</span>
            )}
            {(rsvpCounts.declined ?? 0) > 0 && (
              <span className="text-[10px] font-medium text-[#EF4444]">✗ {rsvpCounts.declined} declined</span>
            )}
          </div>
        )}

        {/* User: RSVP buttons */}
        {showRsvp && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] text-[#6B7280] font-medium">RSVP:</span>
            {(['accepted', 'maybe', 'declined'] as const).map(s => {
              const active = myRsvp === s
              return (
                <button
                  key={s}
                  onClick={() => onRsvp(s)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                    active
                      ? RSVP_STYLE[s].active
                      : 'border-[#232B36] text-[#6B7280] hover:text-[#9CA3AF] hover:border-[#374151]'
                  }`}
                >
                  {RSVP_STYLE[s].label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Expanded attendee list */}
      {expanded && (
        <div className="border-t border-[#232B36]/60 px-4 py-3 bg-[#121821]/50">
          <p className="text-xs text-[#6B7280] font-medium mb-2">
            {invitees.length > 0 ? 'Attendees' : 'No attendees loaded'}
          </p>
          {invitees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {invitees.map(p => (
                <span key={p.id}
                  className="text-xs bg-[#1a2235] border border-[#232B36] text-[#9CA3AF] px-2 py-0.5 rounded-full">
                  {p.full_name}
                </span>
              ))}
            </div>
          )}
          {inviteeIds.length > 0 && invitees.length === 0 && (
            <p className="text-xs text-[#6B7280]">{inviteeIds.length} invited</p>
          )}
        </div>
      )}
    </div>
  )
}

// -- Invitee selector -----------------------------------------

function InviteeSelector({
  participants, selected, onChange,
}: {
  participants: any[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [mode,   setMode]   = useState<'name' | 'position'>('name')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? participants.filter(p => p.full_name?.toLowerCase().includes(q)) : participants
  }, [search, participants])

  const byPosition = useMemo(() => {
    const groups: Record<string, any[]> = {}
    for (const p of filtered) {
      const label = p.ics_position ? getPositionLabel(p.ics_position) : 'No position'
      if (!groups[label]) groups[label] = []
      groups[label].push(p)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.includes(p.id))

  function inviteAll() {
    if (allFilteredSelected) {
      const ids = new Set(filtered.map(p => p.id))
      onChange(selected.filter(id => !ids.has(id)))
    } else {
      const existing = new Set(selected)
      onChange([...selected, ...filtered.map(p => p.id).filter(id => !existing.has(id))])
    }
  }

  function toggleGroup(people: any[]) {
    const gids  = people.map(p => p.id)
    const allIn = gids.every(id => selected.includes(id))
    if (allIn) {
      onChange(selected.filter(id => !gids.includes(id)))
    } else {
      const existing = new Set(selected)
      onChange([...selected, ...gids.filter(id => !existing.has(id))])
    }
  }

  function toggle(uid: string) {
    onChange(selected.includes(uid) ? selected.filter(u => u !== uid) : [...selected, uid])
  }

  const hasNoPhone = participants.some(p => !p.phone_normalized && !p.phone && selected.includes(p.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-0.5 bg-[#121821] rounded-lg p-0.5">
          {(['name', 'position'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                mode === m ? 'bg-[#232B36] text-[#E5E7EB]' : 'text-[#6B7280] hover:text-[#9CA3AF]'
              }`}>
              By {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="text-xs text-[#6B7280]">{selected.length} selected</span>
          )}
          <button type="button" onClick={inviteAll}
            className="text-xs font-semibold text-[#FF5A1F] hover:text-[#FF6A33] transition-colors">
            {allFilteredSelected ? 'Remove All' : 'Invite All'}
          </button>
        </div>
      </div>

      <input className="input mb-2 text-xs" placeholder="Search participants…"
        value={search} onChange={e => setSearch(e.target.value)} />

      <div className="max-h-52 overflow-y-auto rounded-xl border border-[#232B36] divide-y divide-[#232B36]/60">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-[#6B7280] text-center">
            {participants.length === 0 ? 'No participants — assign users to an operational period first' : 'No matches'}
          </p>
        ) : mode === 'name' ? (
          filtered.map(p => (
            <ParticipantRow key={p.id} participant={p}
              checked={selected.includes(p.id)} onToggle={() => toggle(p.id)} />
          ))
        ) : (
          byPosition.map(([label, people]) => (
            <div key={label}>
              <div className="px-3 py-1.5 bg-[#0f1620] flex items-center justify-between sticky top-0 z-10">
                <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide truncate pr-2">{label}</span>
                <button type="button" onClick={() => toggleGroup(people)}
                  className="text-xs text-[#FF5A1F] hover:text-[#FF6A33] transition-colors flex-shrink-0">
                  {people.every(p => selected.includes(p.id)) ? 'Remove' : 'Invite all'}
                </button>
              </div>
              {people.map(p => (
                <ParticipantRow key={p.id} participant={p}
                  checked={selected.includes(p.id)} onToggle={() => toggle(p.id)} />
              ))}
            </div>
          ))
        )}
      </div>

      {hasNoPhone && (
        <p className="text-xs text-[#F59E0B] mt-1.5">
          Some invitees have no phone — they'll receive in-app notifications only.
        </p>
      )}
    </div>
  )
}

function ParticipantRow({ participant: p, checked, onToggle }: {
  participant: any; checked: boolean; onToggle: () => void
}) {
  return (
    <label className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
      checked ? 'bg-[#FF5A1F]/5' : 'hover:bg-[#1a2235]'
    }`}>
      <input type="checkbox" checked={checked} onChange={onToggle}
        className="accent-[#FF5A1F] w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-xs text-[#E5E7EB] flex-1 truncate">{p.full_name}</span>
      {(p.phone_normalized || p.phone) ? (
        <svg className="w-3 h-3 text-[#22C55E] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
        </svg>
      ) : (
        <span className="text-[10px] text-[#6B7280]/40 flex-shrink-0">no phone</span>
      )}
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[#6B7280] font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
