 interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-orange-500 font-mono text-xs tracking-widest uppercase">
              {subtitle}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            {title}
          </h1>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          {children}
        </div>
      </div>
    </div>
  )
}