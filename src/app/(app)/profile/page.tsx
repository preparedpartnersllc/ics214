'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { HomeButton } from '@/components/ui/HomeButton'
import { normalizePhone, formatPhoneDisplay, phoneValidationError } from '@/lib/phone'

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
  const [profile,  setProfile]  = useState<any>(null)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [phone,    setPhone]    = useState('')   // display format
  const [agency,   setAgency]   = useState('')
  const [unit,     setUnit]     = useState('')
  const [timezone, setTimezone] = useState('America/Detroit')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', user.id)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (p) {
        setProfile(p)
        setFullName(p.full_name ?? '')
        // Show normalized phone in display format, fall back to raw
        setPhone(p.phone_normalized ? formatPhoneDisplay(p.phone_normalized) : (p.phone ?? ''))
        setAgency(p.default_agency ?? '')
        setUnit(p.default_unit ?? '')
        setTimezone(p.timezone ?? 'America/Detroit')
      }
    }
    load()
  }, [])

  // Format as user types (US numbers only — international left as-is)
  function handlePhoneChange(raw: string) {
    if (raw.startsWith('+')) {
      setPhone(raw) // international: don't reformat
    } else {
      setPhone(formatPhoneDisplay(raw))
    }
  }

  const phoneError = phoneValidationError(phone)
  const phoneNormalized = normalizePhone(phone)

  async function save() {
    if (phoneError) return
    setSaving(true); setError(null); setSaved(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name:        fullName,
        phone:            phone || null,
        phone_normalized: phoneNormalized,
        default_agency:   agency || null,
        default_unit:     unit || null,
        timezone,
        last_active_at:   new Date().toISOString(),
      })
      .eq('id', user.id)

    if (err) setError(err.message)
    else setSaved(true)
    setSaving(false)
  }

  if (!profile) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading...</p>
    </div>
  )

  // Warn if existing phone can't be normalized (old data)
  const existingPhoneUnusable = profile.phone && !profile.phone_normalized && !normalizePhone(profile.phone)

  return (
    <div className="min-h-screen bg-[#0B0F14] px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-1">Account</p>
        <h1 className="text-xl font-semibold text-[#E5E7EB]">Profile Settings</h1>
      </div>

      {/* Phone missing banner */}
      {!profile.phone_normalized && !profile.phone && (
        <div className="mb-4 bg-[#F59E0B]/8 border border-[#F59E0B]/25 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-[#F59E0B]">Add your phone number</p>
            <p className="text-xs text-[#F59E0B]/70 mt-0.5">Required to receive SMS alerts for meetings and events.</p>
          </div>
        </div>
      )}

      <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-5 space-y-4 mb-4">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">Personal Info</p>

        <FormField label="Full Name">
          <input type="text" className="input" value={fullName}
            onChange={e => setFullName(e.target.value)} />
        </FormField>

        <div>
          <FormField label="Phone Number">
            <input
              type="tel"
              className={`input ${phoneError ? 'border-[#EF4444]/60 focus:border-[#EF4444]' : phoneNormalized ? 'border-[#22C55E]/40' : ''}`}
              value={phone}
              placeholder="(313) 555-0100"
              onChange={e => handlePhoneChange(e.target.value)}
              inputMode="tel"
            />
          </FormField>
          {phoneError && (
            <p className="text-xs text-[#EF4444] mt-1">{phoneError}</p>
          )}
          {!phoneError && phoneNormalized && (
            <p className="text-xs text-[#22C55E] mt-1">
              ✓ Stored as {phoneNormalized}
            </p>
          )}
          {existingPhoneUnusable && !phone && (
            <p className="text-xs text-[#F59E0B] mt-1">
              Your saved number "{profile.phone}" isn't in a recognized format — please update it.
            </p>
          )}
          <p className="text-xs text-[#6B7280] mt-1">
            US: enter 10 digits — international: include + country code
          </p>
        </div>

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

      <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-5 space-y-4 mb-6">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">Preferences</p>

        <FormField label="Timezone">
          <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </FormField>

        <div className="bg-[#121821] rounded-lg px-3 py-2">
          <p className="text-xs text-[#6B7280]">Current time in your timezone:</p>
          <p className="text-sm text-[#E5E7EB] font-mono mt-0.5">
            {new Date().toLocaleString('en-US', { timeZone: timezone })}
          </p>
        </div>
      </div>

      {error  && <p className="text-sm text-[#EF4444] mb-4">{error}</p>}
      {saved  && <p className="text-sm text-[#22C55E] mb-4">✓ Profile updated</p>}

      <Button onClick={save} loading={saving} disabled={!!phoneError}>Save Changes</Button>

      <div className="mt-8 border-t border-[#232B36] pt-6 space-y-1">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-2">Account</p>
        <p className="text-sm text-[#6B7280]">{profile.email}</p>
        <p className="text-xs text-[#6B7280] capitalize">Role: {profile.role}</p>
        <p className="text-xs text-[#6B7280]">
          Status: <span className={profile.is_active ? 'text-[#22C55E]' : 'text-[#EF4444]'}>
            {profile.is_active ? 'Active' : 'Inactive'}
          </span>
        </p>
        {profile.last_active_at && (
          <p className="text-xs text-[#6B7280]">
            Last active: {new Date(profile.last_active_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
