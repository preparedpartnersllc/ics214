 'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

const TIMEZONES = [
  { label: 'Eastern Time (Detroit)', value: 'America/Detroit' },
  { label: 'Eastern Time (New York)', value: 'America/New_York' },
  { label: 'Central Time', value: 'America/Chicago' },
  { label: 'Mountain Time', value: 'America/Denver' },
  { label: 'Pacific Time', value: 'America/Los_Angeles' },
  { label: 'Alaska Time', value: 'America/Anchorage' },
  { label: 'Hawaii Time', value: 'Pacific/Honolulu' },
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [agency, setAgency] = useState('')
  const [unit, setUnit] = useState('')
  const [timezone, setTimezone] = useState('America/Detroit')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      if (p) {
        setProfile(p)
        setFullName(p.full_name ?? '')
        setAgency(p.default_agency ?? '')
        setUnit(p.default_unit ?? '')
        setTimezone(p.timezone ?? 'America/Detroit')
      }
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        default_agency: agency || null,
        default_unit: unit || null,
        timezone,
      })
      .eq('id', user.id)

    if (err) setError(err.message)
    else setSaved(true)
    setSaving(false)
  }

  if (!profile) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">
          Account
        </p>
        <h1 className="text-xl font-semibold text-zinc-100">Profile Settings</h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 mb-4">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
          Personal Info
        </p>

        <FormField label="Full Name">
          <input type="text" className="input" value={fullName}
            onChange={e => setFullName(e.target.value)} />
        </FormField>

        <FormField label="Home Agency">
          <input type="text" className="input" value={agency}
            placeholder="e.g. Detroit Fire Department"
            onChange={e => setAgency(e.target.value)} />
        </FormField>

        <FormField label="Unit">
          <input type="text" className="input" value={unit}
            placeholder="e.g. Engine 23"
            onChange={e => setUnit(e.target.value)} />
        </FormField>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
          Preferences
        </p>

        <FormField label="Timezone">
          <select className="input" value={timezone}
            onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </FormField>

        <div className="bg-zinc-800 rounded-lg px-3 py-2">
          <p className="text-xs text-zinc-500">
            Current time in your timezone:
          </p>
          <p className="text-sm text-zinc-200 font-mono mt-0.5">
            {new Date().toLocaleString('en-US', { timeZone: timezone })}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {saved && (
        <p className="text-sm text-green-400 mb-4">✓ Profile updated</p>
      )}

      <div className="flex gap-3">
        <Button onClick={save} loading={saving}>Save Changes</Button>
        <Link href="/dashboard">
          <button className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            Back to Dashboard
          </button>
        </Link>
      </div>

      <div className="mt-8 border-t border-zinc-800 pt-6">
        <p className="text-xs text-zinc-600 font-mono uppercase tracking-wider mb-2">Account</p>
        <p className="text-sm text-zinc-500">{profile.email}</p>
        <p className="text-xs text-zinc-600 mt-1 capitalize">Role: {profile.role}</p>
      </div>
    </div>
  )
}