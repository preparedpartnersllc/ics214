 import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({
  children, loading, variant = 'primary', className, disabled, ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-orange-600 text-white hover:bg-orange-500 active:scale-[0.98]',
    secondary: 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800',
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