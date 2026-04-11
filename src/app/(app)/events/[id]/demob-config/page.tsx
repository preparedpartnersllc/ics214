'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEMOB_APPROVER_POSITION_OPTIONS } from '@/lib/personnel-lifecycle'
import Link from 'next/link'

export default function DemobConfigPage() {
  const params  = useParams()
  const eventId = params.id as string

  const [event, setEvent]           = useState<any>(null)
  const [configured, setConfigured] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => { load() }, [eventId])

  async function load() {
    const supabase = createClient()
    const [{ data: ev }, { data: roles }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('event_demob_approver_roles').select('ics_position').eq('event_id', eventId),
    ])
    setEvent(ev)
    setConfigured((roles ?? []).map((r: any) => r.ics_position))
    setLoading(false)
  }

  async function toggle(position: string) {
    setError(null)
    setSaving(true)
    const supabase = createClient()
    if (configured.includes(position)) {
      const { error: err } = await supabase
        .from('event_demob_approver_roles')
        .delete()
        .eq('event_id', eventId)
        .eq('ics_position', position)
      if (err) { setError(err.message); setSaving(false); return }
      setConfigured(prev => prev.filter(p => p !== position))
    } else {
      const { error: err } = await supabase
        .from('event_demob_approver_roles')
        .insert({ event_id: eventId, ics_position: position })
      if (err) { setError(err.message); setSaving(false); return }
      setConfigured(prev => [...prev, position])
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href={`/events/${eventId}`} className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Event
          </Link>
          <span className="text-[#232B36] text-xs">/</span>
          <span className="text-xs text-[#E5E7EB] font-medium">Demob Approvers</span>
        </div>

        <h1 className="text-lg font-semibold text-[#E5E7EB] mb-1">Demobilization Approvers</h1>
        <p className="text-xs text-[#6B7280] mb-6">
          Positions that must sign off before a person is fully demobilized.
          If none are configured, demob requests are approved immediately.
        </p>

        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden divide-y divide-[#232B36]/60">
          {DEMOB_APPROVER_POSITION_OPTIONS.map(opt => {
            const active = configured.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                disabled={saving}
                className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-[#1a2235] transition-colors text-left"
              >
                {/* Toggle circle */}
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  active
                    ? 'bg-[#FF5A1F] border-[#FF5A1F]'
                    : 'bg-transparent border-[#374151]'
                }`}>
                  {active && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#E5E7EB]">{opt.label}</p>
                  <p className="text-xs text-[#4B5563] mt-px">{opt.value}</p>
                </div>
                {active && (
                  <span className="text-[10px] font-semibold text-[#FF5A1F] bg-[#FF5A1F]/10 px-2 py-0.5 rounded-full flex-shrink-0">
                    Required
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {error && <p className="text-sm text-[#EF4444] mt-4">{error}</p>}

        <div className="mt-6 p-4 bg-[#161D26] border border-[#232B36] rounded-2xl">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1">How it works</p>
          <p className="text-xs text-[#4B5563] leading-relaxed">
            When a demob is requested for a person, each configured approver who is currently assigned
            to this event gets a notification and must approve before the person is released.
            Common approvers: Logistics (equipment/radio return), Finance (time clearance),
            Safety (incident debrief).
          </p>
        </div>
      </main>
    </div>
  )
}
