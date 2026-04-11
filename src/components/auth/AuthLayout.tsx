interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-[#FF5A1F]" />
            <span className="text-[#FF5A1F] font-mono text-xs tracking-widest uppercase">
              {subtitle}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-[#E5E7EB] tracking-tight">
            {title}
          </h1>
        </div>
        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
