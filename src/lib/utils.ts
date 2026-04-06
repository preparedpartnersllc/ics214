import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatICSDateTime(iso: string): string {
  return format(parseISO(iso), "dd MMM yyyy HHmm")
}

export function formatICSTime(iso: string): string {
  return format(parseISO(iso), 'HHmm')
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy')
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    supervisor: 'Supervisor',
    member: 'Member',
  }
  return labels[role] ?? role
}