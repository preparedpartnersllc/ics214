'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

export default function PeoplePage() {
  const [profiles,         setProfiles]         = useState<any[]>([])
  const [loading,          setLoading]          = useState(true)
  const [search,           setSearch]           = useState('')
  const [inviting,         setInviting]         = useState<string | null>(null)
  const [inviteResults,    setInviteResults]    = useState<Record<string, 'sent' | 'error'>>({})
  const [inviteErrors,     setInviteErrors]     = useState<Record<string, string>>({})
  const [togglingActive,   setTogglingActive]   = useState<string | null>(null)
  const [quickInviteEmail, setQuickInviteEmail] = useState('')
  const [quickInviteState, setQuickInviteState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [quickInviteError, setQuickInviteError] = useState('')

  // Quick SMS invite (direct phone number — no profile required)
  const [quickSmsPhone, setQuickSmsPhone] = useState('')
  const [quickSmsState, setQuickSmsState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [quickSmsError, setQuickSmsError] = useState('')

  // Temp password modal state
  const [tempPwUserId,  setTempPwUserId]  = useState<string | null>(null)
  const [tempPwValue,   setTempPwValue]   = useState('')
  const [tempPwSaving,  setTempPwSaving]  = useState(false)
  const [tempPwError,   setTempPwError]   = useState<string | null>(null)
  const [tempPwSuccess, setTempPwSuccess] = useState<string | null>(null)

  // Force-reset state per user
  const [forcingReset,  setForcingReset]  = useState<string | null>(null)
  const [forceResults,  setForceResults]  = useState<Record<string, 'done' | 'error'>>({})

  // SMS invite state per user
  const [smsInviting,  setSmsInviting]  = useState<string | null>(null)
  const [smsResults,   setSmsResults]   = useState<Record<string, 'sent' | 'error'>>({})
  const [smsErrors,    setSmsErrors]    = useState<Record<string, string>>({})

  // Delete account state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [deleteError,   setDeleteError]   = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles(data ?? [])
    setLoading(false)
  }

  async function sendInvite(userId: string, email: string) {
    if (email.includes('@placeholder.local')) {
      setInviteResults(prev => ({ ...prev, [userId]: 'error' })); return
    }
    setInviting(userId)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setInviteErrors(prev => ({ ...prev, [userId]: body.error ?? 'Unknown error' }))
    }
    setInviteResults(prev => ({ ...prev, [userId]: res.ok ? 'sent' : 'error' }))
    setInviting(null)
  }

  async function sendQuickInvite(e: { preventDefault(): void }) {
    e.preventDefault()
    const email = quickInviteEmail.trim()
    if (!email) return
    setQuickInviteState('sending')
    setQuickInviteError('')
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setQuickInviteState('sent')
      setQuickInviteEmail('')
    } else {
      const body = await res.json().catch(() => ({}))
      setQuickInviteError(body.error ?? 'Failed to send invite')
      setQuickInviteState('error')
    }
  }

  async function sendQuickSms(e: { preventDefault(): void }) {
    e.preventDefault()
    const phone = quickSmsPhone.trim()
    if (!phone) return
    setQuickSmsState('sending')
    setQuickSmsError('')
    const res = await fetch('/api/admin/sms-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (res.ok) {
      setQuickSmsState('sent')
      setQuickSmsPhone('')
    } else {
      const body = await res.json().catch(() => ({}))
      setQuickSmsError(body.error ?? 'Failed to send text invite')
      setQuickSmsState('error')
    }
  }

  async function toggleActive(userId: string, current: boolean) {
    setTogglingActive(userId)
    const supabase = createClient()
    await supabase.from('profiles').update({ is_active: !current }).eq('id', userId)
    setProfiles(prev => prev.map(p => p.id === userId ? { ...p, is_active: !current } : p))
    setTogglingActive(null)
  }

  async function updateRole(userId: string, role: string) {
    const supabase = createClient()
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role } : p))
  }

  // ── Temp password ────────────────────────────────────────────────
  function openTempPw(userId: string) {
    setTempPwUserId(userId)
    setTempPwValue('')
    setTempPwError(null)
    setTempPwSuccess(null)
  }

  function closeTempPw() {
    setTempPwUserId(null)
    setTempPwValue('')
    setTempPwError(null)
    setTempPwSuccess(null)
    setTempPwSaving(false)
  }

  async function saveTempPassword() {
    if (!tempPwUserId) return
    if (tempPwValue.length < 8) {
      setTempPwError('Password must be at least 8 characters'); return
    }
    setTempPwSaving(true)
    setTempPwError(null)
    const res = await fetch('/api/admin/set-temp-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: tempPwUserId, password: tempPwValue }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTempPwError(body.error ?? 'Failed to set password')
      setTempPwSaving(false)
      return
    }
    setTempPwSuccess('Temporary password set. User will be required to reset on next login.')
    setTempPwSaving(false)
    setProfiles(prev => prev.map(p =>
      p.id === tempPwUserId ? { ...p, must_reset_password: true } : p
    ))
  }

  // ── SMS invite ───────────────────────────────────────────────────
  async function sendSmsInvite(userId: string) {
    setSmsInviting(userId)
    setSmsErrors(prev => { const n = { ...prev }; delete n[userId]; return n })
    const res = await fetch('/api/admin/sms-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      setSmsResults(prev => ({ ...prev, [userId]: 'sent' }))
    } else {
      const body = await res.json().catch(() => ({}))
      setSmsErrors(prev => ({ ...prev, [userId]: body.error ?? 'Could not send text invite' }))
      setSmsResults(prev => ({ ...prev, [userId]: 'error' }))
    }
    setSmsInviting(null)
  }

  // ── Delete account ───────────────────────────────────────────────
  async function deleteAccount() {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError(null)
    const res = await fetch('/api/admin/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: confirmDelete }),
    })
    if (res.ok) {
      setProfiles(prev => prev.filter(p => p.id !== confirmDelete))
      setConfirmDelete(null)
    } else {
      const body = await res.json().catch(() => ({}))
      setDeleteError(body.error ?? 'Failed to delete account')
    }
    setDeleting(false)
  }

  // ── Force reset (flag only, no password change) ─────────────────
  async function forceReset(userId: string) {
    setForcingReset(userId)
    const res = await fetch('/api/admin/set-temp-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),  // no password → flag only
    })
    setForceResults(prev => ({ ...prev, [userId]: res.ok ? 'done' : 'error' }))
    if (res.ok) {
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, must_reset_password: true } : p
      ))
    }
    setForcingReset(null)
  }

  const filtered = profiles.filter(p =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.default_agency?.toLowerCase().includes(search.toLowerCase())
  )

  const isPlaceholder = (email: string) => email?.includes('@placeholder.local')

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">

      {/* ── Temp password modal ── */}
      {tempPwUserId && (() => {
        const person = profiles.find(p => p.id === tempPwUserId)
        return (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={closeTempPw}
          >
            <div
              className="bg-[#161D26] border border-[#232B36] rounded-2xl w-full max-w-sm p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div>
                <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">Set Temporary Password</p>
                <p className="text-base font-semibold text-[#E5E7EB] mt-0.5">{person?.full_name}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  User will be required to set their own password on next login.
                </p>
              </div>

              {tempPwSuccess ? (
                <div className="space-y-3">
                  <p className="text-sm text-[#22C55E] flex items-start gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    {tempPwSuccess}
                  </p>
                  <button
                    onClick={closeTempPw}
                    className="w-full text-sm px-4 py-2 rounded-xl border border-[#232B36] text-[#9CA3AF] hover:bg-[#121821] transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-[#6B7280] mb-1.5">Temporary password</label>
                    <input
                      type="text"
                      className="input w-full font-mono"
                      placeholder="min. 8 characters"
                      value={tempPwValue}
                      onChange={e => { setTempPwValue(e.target.value); setTempPwError(null) }}
                      autoFocus
                    />
                    {tempPwError && (
                      <p className="text-xs text-[#EF4444] mt-1">{tempPwError}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveTempPassword}
                      disabled={tempPwSaving || !tempPwValue.trim()}
                      className="flex-1 text-sm px-4 py-2 rounded-xl bg-[#FF5A1F] text-white font-semibold hover:bg-[#FF6A33] disabled:opacity-50 transition-colors"
                    >
                      {tempPwSaving ? 'Saving…' : 'Set password'}
                    </button>
                    <button
                      onClick={closeTempPw}
                      className="text-sm px-4 py-2 rounded-xl border border-[#232B36] text-[#9CA3AF] hover:bg-[#121821] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (() => {
        const person = profiles.find(p => p.id === confirmDelete)
        return (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => { if (!deleting) { setConfirmDelete(null); setDeleteError(null) } }}
          >
            <div
              className="bg-[#161D26] border border-[#EF4444]/30 rounded-2xl w-full max-w-sm p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div>
                <p className="text-xs text-[#EF4444] font-mono uppercase tracking-wider mb-1">Delete Account</p>
                <p className="text-base font-semibold text-[#E5E7EB]">{person?.full_name}</p>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  This permanently deletes the account and all associated data. This cannot be undone.
                </p>
              </div>
              {deleteError && (
                <p className="text-xs text-[#EF4444] bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-lg px-3 py-2">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="flex-1 text-sm px-4 py-2 rounded-xl bg-[#EF4444] text-white font-semibold hover:bg-red-400 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete account'}
                </button>
                <button
                  onClick={() => { setConfirmDelete(null); setDeleteError(null) }}
                  disabled={deleting}
                  className="text-sm px-4 py-2 rounded-xl border border-[#232B36] text-[#9CA3AF] hover:bg-[#121821] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-[#E5E7EB]">People</h1>
          <Link href="/admin/import"
            className="text-xs px-3 py-1.5 rounded-xl border border-[#232B36] text-[#9CA3AF] hover:bg-[#161D26] hover:border-[#3a4555] transition-colors">
            Import CSV
          </Link>
        </div>

        {/* Invite by email */}
        <div className="bg-[#161D26] border border-[#FF5A1F]/15 rounded-2xl p-4 mb-6">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-3">Invite by Email</p>
          <form onSubmit={sendQuickInvite} className="flex gap-2">
            <input
              type="email"
              className="input flex-1"
              placeholder="name@example.com"
              value={quickInviteEmail}
              onChange={e => { setQuickInviteEmail(e.target.value); setQuickInviteState('idle') }}
              disabled={quickInviteState === 'sending'}
            />
            <button
              type="submit"
              disabled={quickInviteState === 'sending' || !quickInviteEmail.trim()}
              className="text-sm px-4 py-2 rounded-xl bg-[#FF5A1F] text-white font-semibold hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {quickInviteState === 'sending' ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
          {quickInviteState === 'sent' && (
            <p className="text-xs text-[#22C55E] mt-2 flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Invite sent
            </p>
          )}
          {quickInviteState === 'error' && (
            <p className="text-xs text-[#EF4444] mt-2">{quickInviteError}</p>
          )}
        </div>

        {/* Invite by text */}
        <div className="bg-[#161D26] border border-[#22C55E]/15 rounded-2xl p-4 mb-6">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-3">Invite by Text</p>
          <form onSubmit={sendQuickSms} className="flex gap-2">
            <input
              type="tel"
              className="input flex-1"
              placeholder="(313) 555-0100"
              value={quickSmsPhone}
              onChange={e => { setQuickSmsPhone(e.target.value); setQuickSmsState('idle') }}
              disabled={quickSmsState === 'sending'}
            />
            <button
              type="submit"
              disabled={quickSmsState === 'sending' || !quickSmsPhone.trim()}
              className="text-sm px-4 py-2 rounded-xl bg-[#22C55E] text-white font-semibold hover:bg-[#16A34A] active:bg-[#15803D] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {quickSmsState === 'sending' ? 'Sending…' : 'Send Text'}
            </button>
          </form>
          {quickSmsState === 'sent' && (
            <p className="text-xs text-[#22C55E] mt-2 flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Text invite sent
            </p>
          )}
          {quickSmsState === 'error' && (
            <p className="text-xs text-[#EF4444] mt-2">{quickSmsError}</p>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6B7280] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="input pl-8"
            placeholder="Search name, email, agency…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Count */}
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
          {filtered.length === profiles.length
            ? `${profiles.length} people`
            : `${filtered.length} of ${profiles.length}`}
        </p>

        {/* Profile list */}
        <div className="space-y-2">
          {filtered.map(p => {
            const inviteResult  = inviteResults[p.id]
            const placeholder   = isPlaceholder(p.email)
            const forceResult   = forceResults[p.id]

            const smsResult = smsResults[p.id]
            const hasPhone  = !!(p.phone_normalized || p.phone)

            return (
              <div key={p.id} className="bg-[#161D26] border border-[#232B36] rounded-2xl p-4 hover:border-[#2a3545] transition-colors">

                {/* Top row */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0 ${
                    p.is_active ? 'bg-[#232B36] text-[#E5E7EB]' : 'bg-[#121821] text-[#6B7280]'
                  }`}>
                    {getInitials(p.full_name ?? '?')}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#E5E7EB]">{p.full_name}</p>
                      {!p.is_active && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#121821] text-[#6B7280]">
                          inactive
                        </span>
                      )}
                      {placeholder && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B]">
                          no login
                        </span>
                      )}
                      {p.must_reset_password && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EF4444]/10 text-[#EF4444]">
                          reset required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5 truncate">
                      {placeholder ? 'Placeholder account' : p.email}
                    </p>
                  </div>

                  <select
                    value={p.role}
                    onChange={e => updateRole(p.id, e.target.value)}
                    className="text-xs bg-[#121821] border border-[#232B36] text-[#9CA3AF] rounded-lg px-2 py-1.5 flex-shrink-0 focus:outline-none focus:border-[#FF5A1F] transition-colors"
                  >
                    <option value="member">Member</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Detail row */}
                {(p.default_agency || p.phone_normalized || p.phone) && (
                  <div className="mt-2 ml-12 flex items-center gap-3 flex-wrap">
                    {p.default_agency && (
                      <span className="text-xs text-[#6B7280]">
                        {p.default_agency}{p.default_unit ? ` · ${p.default_unit}` : ''}
                      </span>
                    )}
                    {(p.phone_normalized || p.phone) && (
                      <span className="text-xs text-[#6B7280] flex items-center gap-1">
                        <svg className="w-3 h-3 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
                        </svg>
                        {p.phone_normalized ?? p.phone}
                      </span>
                    )}
                  </div>
                )}

                {/* Action row */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#232B36]/60 flex-wrap">
                  {!placeholder && (
                    <button
                      onClick={() => sendInvite(p.id, p.email)}
                      disabled={inviting === p.id || inviteResult === 'sent'}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        inviteResult === 'sent'
                          ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25'
                          : inviteResult === 'error'
                          ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                          : 'bg-transparent text-[#9CA3AF] border-[#232B36] hover:bg-[#121821] hover:border-[#3a4555]'
                      }`}
                    >
                      {inviting === p.id     ? 'Sending…'
                        : inviteResult === 'sent'   ? '✓ Invite sent'
                        : inviteResult === 'error'  ? '✗ Failed'
                        : 'Send invite'}
                    </button>
                  )}

                  {/* Text invite — only shown when phone exists */}
                  {hasPhone ? (
                    <button
                      onClick={() => sendSmsInvite(p.id)}
                      disabled={smsInviting === p.id || smsResult === 'sent'}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        smsResult === 'sent'
                          ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25'
                          : smsResult === 'error'
                          ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                          : 'bg-transparent text-[#9CA3AF] border-[#232B36] hover:bg-[#121821] hover:border-[#3a4555]'
                      }`}
                    >
                      {smsInviting === p.id  ? 'Sending…'
                        : smsResult === 'sent'  ? '✓ Text sent'
                        : smsResult === 'error' ? '✗ Failed'
                        : 'Text invite'}
                    </button>
                  ) : (
                    <span className="text-xs text-[#4B5563] px-1">No phone</span>
                  )}

                  {/* Set temp password */}
                  {!placeholder && (
                    <button
                      onClick={() => openTempPw(p.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#232B36] bg-transparent text-[#9CA3AF] hover:bg-[#121821] hover:border-[#3a4555] transition-colors"
                    >
                      Set temp password
                    </button>
                  )}

                  {/* Force reset on next login */}
                  {!placeholder && !p.must_reset_password && (
                    <button
                      onClick={() => forceReset(p.id)}
                      disabled={forcingReset === p.id}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        forceResult === 'done'
                          ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25'
                          : forceResult === 'error'
                          ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                          : 'bg-transparent text-[#9CA3AF] border-[#232B36] hover:bg-[#121821] hover:border-[#3a4555]'
                      }`}
                    >
                      {forcingReset === p.id ? '…' : 'Force reset'}
                    </button>
                  )}

                  <button
                    onClick={() => toggleActive(p.id, p.is_active)}
                    disabled={togglingActive === p.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#232B36] bg-transparent text-[#9CA3AF] hover:bg-[#121821] hover:border-[#3a4555] transition-colors"
                  >
                    {togglingActive === p.id ? '…' : p.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>

                  {inviteResult === 'error' && inviteErrors[p.id] && (
                    <p className="text-xs text-[#EF4444] w-full">{inviteErrors[p.id]}</p>
                  )}
                  {smsResult === 'error' && smsErrors[p.id] && (
                    <p className="text-xs text-[#EF4444] w-full">{smsErrors[p.id]}</p>
                  )}

                  {p.last_active_at && (
                    <span className="text-xs text-[#6B7280]/50 ml-auto">
                      Active {new Date(p.last_active_at).toLocaleDateString()}
                    </span>
                  )}

                  {/* Delete — far right, destructive */}
                  <button
                    onClick={() => { setConfirmDelete(p.id); setDeleteError(null) }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-transparent text-[#EF4444]/50 hover:text-[#EF4444] hover:border-[#EF4444]/25 hover:bg-[#EF4444]/5 transition-colors ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="border border-[#232B36] border-dashed rounded-2xl p-10 text-center">
              <p className="text-sm text-[#6B7280]">No people match your search.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
