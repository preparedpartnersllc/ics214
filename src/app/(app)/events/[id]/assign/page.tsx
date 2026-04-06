 'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function AssignPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.id as string

  const [profiles, setProfiles] = useState<any[]>([])
  const [assigned, setAssigned] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [icsPosition, setIcsPosition] = useState('')
  const [homeAgency, setHomeAgency] = useState('')
  const [homeUnit, setHomeUnit] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: allProfiles }, { data: existingAssignments }] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('assignments').select('user_id').eq('event_id', eventId),
      ])
      setProfiles(allProfiles ?? [])
      setAssigned(existingAssignments?.map((a: any) => a.user_id) ?? [])
    }
    load()
  }, [eventId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser || !icsPosition || !homeAgency) {
      setError('User, ICS Position, and Agency are required')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: err } = await supabase.from('assignments').insert({
      event_id: eventId,
      user_id: selectedUser,
      ics_position: icsPosition,
      home_agency: homeAgency,
      home_unit: homeUnit || null,
      assigned_by: user!.id,
    })

    if (err) { setError(err.message); setLoading(false); return }
    setAssigned(prev => [...prev, selectedUser])
    setSelectedUser('')
    setIcsPosition('')
    setHomeUnit('')
    setLoading(false)
  }

  const unassigned = profiles.filter(p => !assigned.includes(p.id))

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-xl font-semibold text-zinc-100">Assign Personnel</h1>
      </div>

      <form onSubmit={onSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 mb-6">
        <FormField label="Select Member">
          <select
            className="input"
            value={selectedUser}
            onChange={e => {
              setSelectedUser(e.target.value)
              const p = profiles.find(p => p.id === e.target.value)
              if (p) {
                setHomeAgency(p.default_agency ?? '')
                setHomeUnit(p.default_unit ?? '')
                setIcsPosition(p.default_position ?? '')
              }
            }}
          >
            <option value="">-- Choose a member --</option>
            {unassigned.map(p => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
            ))}
          </select>
        </FormField>

        <FormField label="ICS Position *">
          <input type="text" className="input"
            placeholder="e.g. Safety Officer"
            value={icsPosition}
            onChange={e => setIcsPosition(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Home Agency *">
            <input type="text" className="input"
              placeholder="e.g. DFD"
              value={homeAgency}
              onChange={e => setHomeAgency(e.target.value)} />
          </FormField>
          <FormField label="Unit">
            <input type="text" className="input"
              placeholder="Optional"
              value={homeUnit}
              onChange={e => setHomeUnit(e.target.value)} />
          </FormField>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button type="submit" loading={loading} className="w-full">
          Assign to Event
        </Button>
      </form>

      {assigned.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-medium text-zinc-300">Already Assigned ({assigned.length})</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {profiles.filter(p => assigned.includes(p.id)).map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <p className="text-sm text-zinc-300">{p.full_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/events/${eventId}`}
        className="text-sm text-zinc-600 hover:text-zinc-400">
        ← Back to Event
      </Link>
    </div>
  )
}