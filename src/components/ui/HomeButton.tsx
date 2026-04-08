import Link from 'next/link'

export function HomeButton() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors mb-8 group"
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700 transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </span>
      Dashboard
    </Link>
  )
}
