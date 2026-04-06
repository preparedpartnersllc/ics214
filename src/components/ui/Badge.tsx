 import { cn } from '@/lib/utils'

type BadgeVariant = 'active' | 'closed' | 'archived' | 'admin' | 'supervisor' | 'member' | 'reviewed'

const styles: Record<BadgeVariant, string> = {
  active:     'bg-green-900/50 text-green-400 border-green-800',
  closed:     'bg-zinc-800 text-zinc-400 border-zinc-700',
  archived:   'bg-zinc-900 text-zinc-600 border-zinc-800',
  admin:      'bg-orange-900/50 text-orange-400 border-orange-800',
  supervisor: 'bg-blue-900/50 text-blue-400 border-blue-800',
  member:     'bg-zinc-800 text-zinc-400 border-zinc-700',
  reviewed:   'bg-green-900/50 text-green-400 border-green-800',
}

export function Badge({ variant, label }: { variant: BadgeVariant; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border',
      styles[variant]
    )}>
      {label}
    </span>
  )
}