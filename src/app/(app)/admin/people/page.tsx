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
  const [togglingActive, setTogglingActive] = useState<string | null>(null)

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
      body: JSON.stringify({ userId, email }),
    })
    setInviteResults(prev => ({
      ...prev,
      [userId]: res.ok ? 'sent' : 'error'
    }))
    setInviting(null)
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-3xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-xl font-semibold text-zinc-100">People</h1>
        <p className="text-sm text-zinc-500 mt-1">{profiles.length} profiles in system</p>
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
          className="bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors whitespace-nowrap">
          Import CSV
        </Link>
      </div>

      <div className="space-y-3">
        {filtered.map(p => {
          const inviteResult = inviteResults[p.id]
          const placeholder = isPlaceholder(p.email)

          return (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0 ${
                  p.is_active ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {getInitials(p.full_name ?? '?')}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-zinc-200">{p.full_name}</p>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      p.is_active ? 'bg-green-900/40 text-green-500' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {p.is_active ? 'active' : 'inactive'}
                    </span>
                    {placeholder && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-500">
                        no login
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500 mt-0.5">
                    {placeholder ? 'Placeholder account' : p.email}
                  </p>

                  {p.default_agency && (
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {p.default_agency}{p.default_unit ? ` · ${p.default_unit}` : ''}
                    </p>
                  )}

                  {p.phone && (
                    <p className="text-xs text-zinc-600 mt-0.5">{p.phone}</p>
                  )}

                  {p.notes && (
                    <p className="text-xs text-zinc-600 mt-0.5 italic">{p.notes}</p>
                  )}

                  {p.last_active_at && (
                    <p className="text-xs text-zinc-700 mt-0.5">
                      Last active: {new Date(p.last_active_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Role selector */}
                <select
                  value={p.role}
                  onChange={e => updateRole(p.id, e.target.value)}
                  className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1 flex-shrink-0"
                >
                  <option value="member">Member</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {!placeholder && (
                  <button
                    onClick={() => sendInvite(p.id, p.email)}
                    disabled={inviting === p.id || inviteResult === 'sent'}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      inviteResult === 'sent'
                        ? 'bg-green-900/30 text-green-400 border-green-800'
                        : inviteResult === 'error'
                        ? 'bg-red-900/30 text-red-400 border-red-800'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    {inviting === p.id ? 'Sending...'
                      : inviteResult === 'sent' ? '✓ Invite sent'
                      : inviteResult === 'error' ? '× Failed'
                      : 'Send invite'}
                  </button>
                )}

                <button
                  onClick={() => toggleActive(p.id, p.is_active)}
                  disabled={togglingActive === p.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
                >
                  {togglingActive === p.id ? '...' : p.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-zinc-600 text-sm">
            No profiles found.
          </div>
        )}
      </div>
    </div>
  )
}