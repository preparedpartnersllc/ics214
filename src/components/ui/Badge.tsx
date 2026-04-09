import { cn } from '@/lib/utils'

type BadgeVariant = 'active' | 'closed' | 'archived' | 'admin' | 'supervisor' | 'member' | 'reviewed'

const styles: Record<BadgeVariant, string> = {
  active:     'bg-[#22C55E]/10 text-[#22C55E] ring-1 ring-inset ring-[#22C55E]/20',
  closed:     'bg-[#6B7280]/10 text-[#9CA3AF] ring-1 ring-inset ring-[#9CA3AF]/20',
  archived:   'bg-[#6B7280]/10 text-[#6B7280] ring-1 ring-inset ring-[#6B7280]/20',
  admin:      'bg-[#FF5A1F]/10 text-[#FF5A1F] ring-1 ring-inset ring-[#FF5A1F]/20',
  supervisor: 'bg-[#3B82F6]/10 text-[#3B82F6] ring-1 ring-inset ring-[#3B82F6]/20',
  member:     'bg-[#6B7280]/10 text-[#9CA3AF] ring-1 ring-inset ring-[#9CA3AF]/20',
  reviewed:   'bg-[#22C55E]/10 text-[#22C55E] ring-1 ring-inset ring-[#22C55E]/20',
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
