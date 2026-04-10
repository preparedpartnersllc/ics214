'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/auth/actions'
import { NotificationBell } from '@/components/NotificationBell'

export function GlobalNav() {
  const pathname = usePathname()
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()
      if (p) setProfile(p)
    }
    load()
  }, [])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const initials = profile?.full_name
    ?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/meetings') return pathname === '/meetings'
    return pathname.startsWith(href)
  }

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/events', label: 'Events' },
    { href: '/meetings', label: 'Meetings' },
    ...(profile?.role === 'admin' ? [{ href: '/admin/people', label: 'People' }] : []),
  ]

  return (
    <nav className="sticky top-0 z-30 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70">
      <div className="px-4 max-w-2xl mx-auto h-12 flex items-center gap-3">

        {/* Logo */}
        <Link
          href="/dashboard"
          className="text-[11px] font-bold text-[#FF5A1F] uppercase tracking-widest flex-shrink-0 mr-1"
        >
          ICS 214
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {navLinks.map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                isActive(href)
                  ? 'bg-[#1a2235] text-[#E5E7EB]'
                  : 'text-[#6B7280] hover:text-[#E5E7EB] hover:bg-[#161D26]'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right: bell + avatar */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {userId && <NotificationBell userId={userId} />}

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="w-8 h-8 rounded-full bg-[#161D26] border border-[#232B36] flex items-center justify-center text-[11px] font-semibold text-[#9CA3AF] hover:border-[#3a4555] hover:text-[#E5E7EB] active:scale-95 transition-all duration-150"
            >
              {initials}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 w-44 bg-[#161D26] border border-[#232B36] rounded-xl shadow-2xl shadow-black/50 py-1 z-50 animate-entry">
                <div className="px-3 py-2 border-b border-[#232B36]">
                  <p className="text-xs font-semibold text-[#E5E7EB] truncate">{profile?.full_name ?? '—'}</p>
                  <p className="text-[10px] text-[#6B7280] capitalize mt-0.5">{profile?.role ?? ''}</p>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[#E5E7EB] hover:bg-[#1a2235] transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                  Profile
                </Link>
                <div className="border-t border-[#232B36] mt-1" />
                <form action={logout}>
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#EF4444] hover:bg-[#1a2235] transition-colors text-left"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                    </svg>
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
