'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isSuperAdmin } from '@/lib/roles'

const BASE_TABS = [
  { href: '/admin',          label: 'Overview',  exact: true },
  { href: '/admin/people',   label: 'People',    exact: false },
  { href: '/admin/agencies', label: 'Agencies',  exact: false },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .from('profiles')
      .select('role')
      .then(({ data }) => {
        // single() alternative — filter by current user
      })
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (data) setRole(data.role)
    }
    load()
  }, [])

  const tabs = isSuperAdmin(role)
    ? BASE_TABS
    : BASE_TABS.filter(t => t.href !== '/admin/agencies') // regular admins skip agency mgmt

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      {/* Admin sub-nav */}
      <div className="border-b border-[#232B36] bg-[#0D1117]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-1 h-10">
            {isSuperAdmin(role) && (
              <span className="text-[10px] font-bold text-[#FF5A1F] bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 rounded px-1.5 py-0.5 mr-2 uppercase tracking-wider">
                Super Admin
              </span>
            )}
            {tabs.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive(tab.href, tab.exact)
                    ? 'text-[#E5E7EB] bg-[#1a2235]'
                    : 'text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#161D26]'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
