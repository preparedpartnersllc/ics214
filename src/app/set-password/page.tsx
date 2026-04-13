'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { normalizePhone, formatPhoneDisplay, phoneValidationError } from '@/lib/phone'

export default function SetPasswordPage() {
  const router = useRouter()

  // Token exchange state
  const [userId,     setUserId]     = useState<string | null>(null)
  const [userEmail,  setUserEmail]  = useState<string>('')
  const [tokenError, setTokenError] = useState<string | null>(null)

  // Form fields
  const [fullName,  setFullName]  = useState('')
  const [agency,    setAgency]    = useState('')
  const [unit,      setUnit]      = useState('')
  const [phone,     setPhone]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')

  // UI state
  const [agencies,     setAgencies]     = useState<string[]>([])
  const [lockedAgency, setLockedAgency] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  const phoneError    = phoneValidationError(phone)
  const phoneNorm     = normalizePhone(phone)
  const passwordMismatch = confirm.length > 0 && password !== confirm

  // Step 1: exchange token from URL hash
  useEffect(() => {
    const supabase = createClient()
    const hash        = window.location.hash.slice(1)
    const hashParams  = new URLSearchParams(hash)
    const queryParams = new URLSearchParams(window.location.search)
    const accessToken  = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const agencyParam  = queryParams.get('agency') ?? ''

    if (!accessToken || !refreshToken) {
      setTokenError('Invalid or expired invite link. Please ask an admin to resend your invite.')
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async ({ data, error }) => {
        if (error || !data.user) {
          setTokenError('This invite link has expired or already been used. Please ask an admin to resend your invite.')
          return
        }
        // Clear hash + query from URL so the token isn't visible / reused
        window.history.replaceState(null, '', window.location.pathname)
        setUserId(data.user.id)
        setUserEmail(data.user.email ?? '')

        if (agencyParam) {
          // Pre-fill and lock agency from the inviting admin
          setAgency(agencyParam)
          setAgencies([agencyParam])
          setLockedAgency(true)
        } else {
          // No agency passed — load full list so user can choose
          const { data: agencyRows } = await supabase
            .from('agencies').select('name').eq('is_active', true).order('name')
          setAgencies((agencyRows ?? []).map((a: any) => a.name))
        }
      })
  }, [])

  function handlePhoneChange(raw: string) {
    setPhone(raw.startsWith('+') ? raw : formatPhoneDisplay(raw))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (phoneError) return
    if (password.length < 8) { setSubmitError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setSubmitError('Passwords do not match.'); return }
    if (!fullName.trim()) { setSubmitError('Please enter your full name.'); return }
    if (!agency) { setSubmitError('Please select your agency.'); return }

    setSaving(true)
    setSubmitError(null)
    const supabase = createClient()

    // Set the password
    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setSubmitError(pwErr.message); setSaving(false); return }

    // Save profile (upsert in case trigger already created the row)
    const { error: profErr } = await supabase.from('profiles').upsert({
      id:               userId,
      email:            userEmail,
      full_name:        fullName.trim(),
      default_agency:   agency,
      default_unit:     unit.trim() || null,
      phone:            phone || null,
      phone_normalized: phoneNorm || null,
      is_active:        true,
      must_reset_password: false,
    }, { onConflict: 'id' })

    if (profErr) { setSubmitError(profErr.message); setSaving(false); return }

    router.push('/dashboard')
  }

  // --- Error state ---
  if (tokenError) {
    return (
      <AuthLayout title="Invalid Link" subtitle="Command OS">
        <p className="text-sm text-[#EF4444]">{tokenError}</p>
      </AuthLayout>
    )
  }

  // --- Loading / verifying token ---
  if (!userId) {
    return (
      <AuthLayout title="Verifying invite…" subtitle="Command OS">
        <p className="text-sm text-[#9CA3AF]">Please wait…</p>
      </AuthLayout>
    )
  }

  // --- Account setup form ---
  return (
    <AuthLayout title="Set Up Your Account" subtitle="Command OS">
      <p className="text-sm text-[#6B7280] mb-6">
        Welcome to Command OS. Fill out your information below to activate your account.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">

        {/* Account info banner */}
        <div className="bg-[#161D26] border border-[#232B36] rounded-xl px-3 py-2 mb-2">
          <p className="text-xs text-[#6B7280]">Signing up as</p>
          <p className="text-sm font-medium text-[#E5E7EB]">{userEmail}</p>
        </div>

        {/* Name */}
        <FormField label="Full Name">
          <input
            type="text"
            autoComplete="name"
            className="input"
            placeholder="John Smith"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
          />
        </FormField>

        {/* Agency */}
        <div>
          <p className="text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wide">Agency</p>
          {lockedAgency ? (
            <div className="input flex items-center justify-between opacity-80 cursor-not-allowed select-none">
              <span className="text-[#E5E7EB]">{agency}</span>
              <span className="text-xs text-[#6B7280]">Set by your admin</span>
            </div>
          ) : (
            <select
              className="input"
              value={agency}
              onChange={e => setAgency(e.target.value)}
              required
            >
              <option value="" disabled>Select your agency…</option>
              {agencies.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Unit */}
        <FormField label="Unit (optional)">
          <input
            type="text"
            className="input"
            placeholder="e.g. Engine 23"
            value={unit}
            onChange={e => setUnit(e.target.value)}
          />
        </FormField>

        {/* Phone */}
        <div>
          <FormField label="Phone Number">
            <div className="relative">
              <input
                type="tel"
                inputMode="tel"
                className={`input pr-8 ${
                  phoneError
                    ? 'border-[#EF4444]/60 focus:border-[#EF4444]'
                    : phoneNorm
                    ? 'border-[#22C55E]/40 focus:border-[#22C55E]/60'
                    : ''
                }`}
                placeholder="(313) 555-0100"
                value={phone}
                onChange={e => handlePhoneChange(e.target.value)}
              />
              {!phoneError && phoneNorm && (
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              )}
            </div>
          </FormField>
          {phoneError && <p className="text-xs text-[#EF4444] mt-1">{phoneError}</p>}
          {!phoneError && phoneNorm && <p className="text-xs text-[#22C55E] mt-1">Stored as {phoneNorm}</p>}
          <p className="text-xs text-[#6B7280] mt-1">Required for SMS alerts. US: 10 digits · International: include + country code</p>
        </div>

        {/* Divider */}
        <div className="border-t border-[#232B36] pt-2">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-3">Set Password</p>
        </div>

        {/* Password */}
        <FormField label="Password">
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </FormField>

        {/* Confirm password */}
        <div>
          <FormField label="Confirm Password">
            <input
              type="password"
              autoComplete="new-password"
              className={`input ${passwordMismatch ? 'border-[#EF4444]/60' : ''}`}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </FormField>
          {passwordMismatch && <p className="text-xs text-[#EF4444] mt-1">Passwords do not match</p>}
        </div>

        {submitError && (
          <p className="text-sm text-[#EF4444] flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          loading={saving}
          className="w-full"
          disabled={saving || !!phoneError || passwordMismatch}
        >
          Activate account
        </Button>
      </form>
    </AuthLayout>
  )
}
