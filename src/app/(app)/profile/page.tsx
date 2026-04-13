'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormField } from '@/components/ui/FormField'
import { normalizePhone, formatPhoneDisplay, phoneValidationError } from '@/lib/phone'
import { isSuperAdmin } from '@/lib/roles'

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

  const [fullName,  setFullName]  = useState('')
  const [phone,     setPhone]     = useState('')
  const [agency,    setAgency]    = useState('')
  const [unit,      setUnit]      = useState('')
  const [timezone,  setTimezone]  = useState('America/Detroit')
  const [agencies,  setAgencies]  = useState<string[]>([])
  const [canEditAgency, setCanEditAgency] = useState(false)

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
        setPhone(p.phone_normalized ? formatPhoneDisplay(p.phone_normalized) : (p.phone ?? ''))
        setAgency(p.default_agency ?? '')
        setUnit(p.default_unit ?? '')
        setTimezone(p.timezone ?? 'America/Detroit')
        if (isSuperAdmin(p.role)) {
          setCanEditAgency(true)
          const { data: agencyRows } = await supabase
            .from('agencies').select('name').eq('is_active', true).order('name')
          setAgencies((agencyRows ?? []).map((a: any) => a.name))
        }
      }
    }
    load()
  }, [])

  function handlePhoneChange(raw: string) {
    if (raw.startsWith('+')) {
      setPhone(raw)
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
        default_unit:     unit || null,
        timezone,
        last_active_at:   new Date().toISOString(),
        ...(canEditAgency ? { default_agency: agency || null } : {}),
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

  const existingPhoneUnusable = profile.phone && !profile.phone_normalized && !normalizePhone(profile.phone)

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        <div className="mb-6">
          <h1 className="text-lg font-semibold text-[#E5E7EB]">Profile</h1>
          <p className="text-xs text-[#6B7280] mt-0.5">{profile.email}</p>
        </div>

        {/* Phone missing banner */}
        {!profile.phone_normalized && !profile.phone && (
          <div className="mb-5 bg-[#F59E0B]/8 border border-[#F59E0B]/25 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
            </svg>
            <div>
              <p className="text-sm font-semibold text-[#F59E0B]">Add your phone number</p>
              <p className="text-xs text-[#F59E0B]/70 mt-0.5">Required to receive SMS alerts for meetings and events.</p>
            </div>
          </div>
        )}

        {/* Personal Info */}
        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-5 space-y-5 mb-4">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">Personal Info</p>

          <FormField label="Full Name">
            <input type="text" className="input" value={fullName}
              onChange={e => setFullName(e.target.value)} />
          </FormField>

          <div>
            <FormField label="Phone Number">
              <div className="relative">
                <input
                  type="tel"
                  className={`input pr-8 ${
                    phoneError
                      ? 'border-[#EF4444]/60 focus:border-[#EF4444]'
                      : phoneNormalized
                      ? 'border-[#22C55E]/40 focus:border-[#22C55E]/60'
                      : ''
                  }`}
                  value={phone}
                  placeholder="(313) 555-0100"
                  onChange={e => handlePhoneChange(e.target.value)}
                  inputMode="tel"
                />
                {!phoneError && phoneNormalized && (
                  <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </div>
            </FormField>
            {phoneError && (
              <p className="text-xs text-[#EF4444] mt-1.5 flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {phoneError}
              </p>
            )}
            {!phoneError && phoneNormalized && (
              <p className="text-xs text-[#22C55E] mt-1.5">Stored as {phoneNormalized}</p>
            )}
            {existingPhoneUnusable && !phone && (
              <p className="text-xs text-[#F59E0B] mt-1.5">
                Your saved number "{profile.phone}" isn't recognized — please update it.
              </p>
            )}
            <p className="text-xs text-[#6B7280] mt-1.5">
              US: enter 10 digits · International: include + country code
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wide">Home Agency</p>
            {canEditAgency ? (
              <select className="input" value={agency} onChange={e => setAgency(e.target.value)}>
                <option value="">Select agency…</option>
                {agencies.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : agency ? (
              <div className="input flex items-center justify-between opacity-70 cursor-not-allowed select-none">
                <span className="text-[#E5E7EB]">{agency}</span>
                <span className="text-xs text-[#6B7280]">Contact admin to change</span>
              </div>
            ) : (
              <div className="input text-[#6B7280] opacity-70 cursor-not-allowed">
                No agency assigned — contact your administrator
              </div>
            )}
          </div>

          <FormField label="Unit">
            <input type="text" className="input" value={unit}
              placeholder="e.g. Engine 23"
              onChange={e => setUnit(e.target.value)} />
          </FormField>
        </div>

        {/* Preferences */}
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

        {/* Save feedback */}
        {error && (
          <p className="text-sm text-[#EF4444] mb-4 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            {error}
          </p>
        )}
        {saved && (
          <div className="mb-4 bg-[#22C55E]/8 border border-[#22C55E]/20 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#22C55E] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <p className="text-sm font-medium text-[#22C55E]">Profile updated successfully</p>
          </div>
        )}

        <button
          onClick={save}
          disabled={saving || !!phoneError}
          className="w-full bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.99] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>

        {/* Account info */}
        <div className="mt-8 border-t border-[#232B36] pt-6 space-y-1.5">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-3">Account</p>
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
      </main>
    </div>
  )
}
