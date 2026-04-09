import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({
  children, loading, variant = 'primary', className, disabled, ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A1F]/40'
  const variants = {
    primary: 'bg-[#FF5A1F] text-white hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.98] shadow-sm',
    secondary: 'bg-transparent text-[#9CA3AF] border border-[#232B36] hover:bg-[#161D26] hover:border-[#3a4555]',
    danger: 'bg-[#EF4444] text-white hover:bg-red-400 active:scale-[0.98]',
    ghost: 'text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#161D26]/80',
  }

  return (
    <button
      className={cn(base, variants[variant], className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      )}
      {children}
    </button>
  )
}
