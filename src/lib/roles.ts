export type AppRole = 'super_admin' | 'admin' | 'supervisor' | 'member'

/** True for admin and super_admin — can perform admin actions */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** True only for super_admin — cannot be deleted or demoted by regular admins */
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'super_admin'
}

/** True for admin, super_admin, and supervisor */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'supervisor'
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin': return 'Super Admin'
    case 'admin':       return 'Admin'
    case 'supervisor':  return 'Supervisor'
    default:            return 'Member'
  }
}
