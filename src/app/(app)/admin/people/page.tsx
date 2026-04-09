'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HomeButton } from '@/components/ui/HomeButton'
import { Button } from '@/components/ui/Button'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

export default function PeoplePage() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState<string | null>(null)
  const [inviteResults, setInviteResults] = useState<Record<string, 'sent' | 'error'>>({})
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({})
  const [togglingActive, setTogglingActive] = useState<string | null>(null)
  const [quickInviteEmail, setQuickInviteEmail] = useState('')
  const [quickInviteState, setQuickInviteState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [quickInviteError, setQuickInviteError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name')
    setProfiles(data ?? [])
    setLoading(false)
  }

  async function sendInvite(userId: string, email: string) {
    if (email.includes('@placeholder.local')) {
      setInviteResults(prev => ({ ...prev, [userId]: 'error' }))
      return
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
    setInviteResults(prev => ({
      ...prev,
      [userId]: res.ok ? 'sent' : 'error'
    }))
    setInviting(null)
  }

  async function sendQuickInvite(e: React.FormEvent) {
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

  async function toggleActive(userId: string, current: boolean) {
    setTogglingActive(userId)
    const supabase = createClient()
    await supabase.from('profiles')
      .update({ is_active: !current })
      .eq('id', userId)
    setProfiles(prev => prev.map(p =>
      p.id === userId ? { ...p, is_active: !current } : p
    ))
    setTogglingActive(null)
  }

  async function updateRole(userId: string, role: string) {
    const supabase = createClient()
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setProfiles(prev => prev.map(p =>
      p.id === userId ? { ...p, role } : p
    ))
  }

  const filtered = profiles.filter(p =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.default_agency?.toLowerCase().includes(search.toLowerCase())
  )

  const isPlaceholder = (email: string) => email?.includes('@placeholder.local')

  if (loading) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B0F14] px-4 py-8 max-w-3xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-xl font-semibold text-[#E5E7EB]">People</h1>
        <p className="text-sm text-[#6B7280] mt-1">{profiles.length} profiles in system</p>
      </div>

      <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-4 mb-6">
        <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-3">Invite by email</p>
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
            className="text-sm px-4 py-2 rounded-lg bg-[#FF5A1F] text-white font-medium hover:bg-[#FF6A33] active:bg-[#E14A12] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {quickInviteState === 'sending' ? 'Sending...' : 'Send invite'}
          </button>
        </form>
        {quickInviteState === 'sent' && (
          <p className="text-xs text-[#22C55E] mt-2">✓ Invite sent</p>
        )}
        {quickInviteState === 'error' && (
          <p className="text-xs text-[#EF4444] mt-2">{quickInviteError}</p>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          className="input flex-1"
          placeholder="Search by name, email, or agency..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Link href="/admin/import"
          className="bg-transparent text-[#9CA3AF] border border-[#232B36] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#161D26] hover:border-[#3a4555] transition-colors whitespace-nowrap">
          Import CSV
        </Link>
      </div>

      <div className="space-y-3">
        {filtered.map(p => {
          const inviteResult = inviteResults[p.id]
          const placeholder = isPlaceholder(p.email)

          return (
            <div key={p.id} className="bg-[#161D26] border border-[#232B36] rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0 ${
                  p.is_active ? 'bg-[#232B36] text-[#E5E7EB]' : 'bg-[#121821] text-[#6B7280]'
                }`}>
                  {getInitials(p.full_name ?? '?')}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#E5E7EB]">{p.full_name}</p>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      p.is_active ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#121821] text-[#6B7280]'
                    }`}>
                      {p.is_active ? 'active' : 'inactive'}
                    </span>
                    {placeholder && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B]">
                        no login
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {placeholder ? 'Placeholder account' : p.email}
                  </p>

                  {p.default_agency && (
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      {p.default_agency}{p.default_unit ? ` · ${p.default_unit}` : ''}
                    </p>
                  )}

                  {p.phone && (
                    <p className="text-xs text-[#6B7280] mt-0.5">{p.phone}</p>
                  )}

                  {p.notes && (
                    <p className="text-xs text-[#6B7280] mt-0.5 italic">{p.notes}</p>
                  )}

                  {p.last_active_at && (
                    <p className="text-xs text-[#6B7280]/60 mt-0.5">
                      Last active: {new Date(p.last_active_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <select
                  value={p.role}
                  onChange={e => updateRole(p.id, e.target.value)}
                  className="text-xs bg-[#121821] border border-[#232B36] text-[#9CA3AF] rounded-lg px-2 py-1 flex-shrink-0 focus:outline-none focus:border-[#FF5A1F]"
                >
                  <option value="member">Member</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                {!placeholder && (
                  <>
                    <button
                      onClick={() => sendInvite(p.id, p.email)}
                      disabled={inviting === p.id || inviteResult === 'sent'}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        inviteResult === 'sent'
                          ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25'
                          : inviteResult === 'error'
                          ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                          : 'bg-transparent text-[#9CA3AF] border-[#232B36] hover:bg-[#121821] hover:border-[#3a4555]'
                      }`}
                    >
                      {inviting === p.id ? 'Sending...'
                        : inviteResult === 'sent' ? '✓ Invite sent'
                        : inviteResult === 'error' ? '× Failed'
                        : 'Send invite'}
                    </button>
                    {inviteResult === 'error' && inviteErrors[p.id] && (
                      <p className="text-xs text-[#EF4444] mt-1 w-full">{inviteErrors[p.id]}</p>
                    )}
                  </>
                )}

                <button
                  onClick={() => toggleActive(p.id, p.is_active)}
                  disabled={togglingActive === p.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[#232B36] bg-transparent text-[#9CA3AF] hover:bg-[#121821] hover:border-[#3a4555] transition-colors"
                >
                  {togglingActive === p.id ? '...' : p.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#6B7280] text-sm">
            No profiles found.
          </div>
        )}
      </div>
    </div>
  )
}
