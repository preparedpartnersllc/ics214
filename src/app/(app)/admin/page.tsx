'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isSuperAdmin } from '@/lib/roles'

type PendingUser = { id: string; full_name: string; email: string; default_agency: string | null; created_at: string }

export default function AdminHubPage() {
  const [role,         setRole]         = useState<string | null>(null)
  const [pending,      setPending]      = useState<PendingUser[]>([])
  const [totalPeople,  setTotalPeople]  = useState(0)
  const [totalAgencies,setTotalAgencies]= useState(0)
  const [approving,    setApproving]    = useState<string | null>(null)
  const [dismissing,   setDismissing]   = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, pendingRes, countRes, agencyRes] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('profiles')
        .select('id, full_name, email, default_agency, created_at')
        .eq('is_active', false)
        .not('email', 'like', '%@placeholder.local')
        .order('created_at', { ascending: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('agencies').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])

    if (profileRes.data) setRole(profileRes.data.role)
    setPending(pendingRes.data ?? [])
    setTotalPeople(countRes.count ?? 0)
    setTotalAgencies(agencyRes.count ?? 0)
  }

  async function approve(userId: string) {
    setApproving(userId)
    const supabase = createClient()
    await supabase.from('profiles').update({ is_active: true }).eq('id', userId)
    setPending(prev => prev.filter(p => p.id !== userId))
    setTotalPeople(n => n) // count stays same — they were already counted
    setApproving(null)
  }

  async function dismiss(userId: string) {
    setDismissing(userId)
    const res = await fetch('/api/admin/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) setPending(prev => prev.filter(p => p.id !== userId))
    setDismissing(null)
  }

  const activeCount = totalPeople - pending.length

  return (
    <main className="max-w-4xl mx-auto px-4 pt-6 pb-16">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#E5E7EB]">Admin Hub</h1>
        <p className="text-xs text-[#6B7280] mt-0.5">Manage people, agencies, and access</p>
      </div>

      {/* Pending approvals — most important, always at top */}
      <section className="mb-6">
        <div className={`rounded-2xl border ${pending.length > 0 ? 'border-[#F59E0B]/30 bg-[#F59E0B]/5' : 'border-[#232B36] bg-[#161D26]'}`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#232B36]/60">
            <div className="flex items-center gap-2.5">
              {pending.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F59E0B] text-[10px] font-bold text-black">
                  {pending.length}
                </span>
              )}
              <p className="text-sm font-semibold text-[#E5E7EB]">Pending Approvals</p>
            </div>
            {pending.length === 0 && (
              <span className="text-xs text-[#22C55E] font-medium">All clear</span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-[#6B7280]">No accounts waiting for approval.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#232B36]/50">
              {pending.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#E5E7EB] truncate">{p.full_name || '(no name)'}</p>
                    <p className="text-xs text-[#6B7280] truncate">{p.email}</p>
                    {p.default_agency && (
                      <p className="text-xs text-[#FF5A1F] mt-0.5">{p.default_agency}</p>
                    )}
                  </div>
                  <p className="text-[10px] text-[#6B7280] shrink-0 hidden sm:block">
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => dismiss(p.id)}
                      disabled={dismissing === p.id || approving === p.id}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 disabled:opacity-40 transition-colors"
                    >
                      {dismissing === p.id ? '…' : 'Deny'}
                    </button>
                    <button
                      onClick={() => approve(p.id)}
                      disabled={approving === p.id || dismissing === p.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#22C55E] text-black font-semibold hover:bg-[#16a34a] disabled:opacity-40 transition-colors"
                    >
                      {approving === p.id ? '…' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3">
        <div className="bg-[#161D26] border border-[#232B36] rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-[#E5E7EB]">{activeCount}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">Active members</p>
        </div>
        <div className="bg-[#161D26] border border-[#232B36] rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-[#E5E7EB]">{pending.length}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">Pending approval</p>
        </div>
        {isSuperAdmin(role) && (
          <div className="bg-[#161D26] border border-[#232B36] rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-[#E5E7EB]">{totalAgencies}</p>
            <p className="text-xs text-[#6B7280] mt-0.5">Active agencies</p>
          </div>
        )}
      </div>

      {/* Management cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/people" className="group block bg-[#161D26] border border-[#232B36] hover:border-[#FF5A1F]/40 rounded-2xl p-5 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-[#E5E7EB] group-hover:text-white transition-colors">People</p>
              <p className="text-xs text-[#6B7280] mt-1">Manage roles, send invites, set passwords, activate accounts</p>
            </div>
            <svg className="w-4 h-4 text-[#6B7280] group-hover:text-[#FF5A1F] mt-0.5 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
          <p className="text-xs text-[#FF5A1F] mt-3 font-medium">{totalPeople} total accounts →</p>
        </Link>

        {isSuperAdmin(role) && (
          <Link href="/admin/agencies" className="group block bg-[#161D26] border border-[#232B36] hover:border-[#FF5A1F]/40 rounded-2xl p-5 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-[#E5E7EB] group-hover:text-white transition-colors">Agencies</p>
                <p className="text-xs text-[#6B7280] mt-1">Add or deactivate agencies available on the registration form</p>
              </div>
              <svg className="w-4 h-4 text-[#6B7280] group-hover:text-[#FF5A1F] mt-0.5 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
            <p className="text-xs text-[#FF5A1F] mt-3 font-medium">{totalAgencies} active agencies →</p>
          </Link>
        )}
      </div>

    </main>
  )
}
