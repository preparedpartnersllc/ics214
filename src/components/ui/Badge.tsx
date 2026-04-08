import { cn } from '@/lib/utils'

type BadgeVariant = 'active' | 'closed' | 'archived' | 'admin' | 'supervisor' | 'member' | 'reviewed'

const styles: Record<BadgeVariant, string> = {
  active:     'bg-green-500/10 text-green-400 ring-1 ring-inset ring-green-500/20',
  closed:     'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/20',
  archived:   'bg-zinc-500/10 text-zinc-600 ring-1 ring-inset ring-zinc-700/30',
  admin:      'bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/20',
  supervisor: 'bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20',
  member:     'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/20',
  reviewed:   'bg-green-500/10 text-green-400 ring-1 ring-inset ring-green-500/20',
}

export function Badge({ variant, label }: { variant: BadgeVariant; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      styles[variant]
    )}>
      {label}
    </span>
  )
}
