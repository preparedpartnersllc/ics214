/**
 * Normalize a phone number string to E.164 format (+1XXXXXXXXXX for US).
 * Returns null if the input cannot be normalized to a valid number.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  const stripped = raw.trim()
  // Remove everything except digits and a possible leading +
  const digits = stripped.replace(/\D/g, '')
  if (!digits) return null

  // US 10-digit: 3135550100 → +13135550100
  if (digits.length === 10) return `+1${digits}`

  // US 11-digit starting with 1: 13135550100 → +13135550100
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`

  // International with explicit + prefix and 7–15 digits
  if (stripped.startsWith('+') && digits.length >= 7 && digits.length <= 15) return `+${digits}`

  // Reject anything else (too short, too long, ambiguous)
  return null
}

/**
 * Format digits as user types for US numbers.
 * Returns a display string like (313) 555-0100.
 * Passes through non-US/international (+...) unchanged.
 */
export function formatPhoneDisplay(raw: string): string {
  if (raw.startsWith('+')) return raw // leave international as-is
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Returns a user-facing validation message, or null if valid.
 */
export function phoneValidationError(raw: string): string | null {
  if (!raw.trim()) return null // empty is OK (optional field)
  const normalized = normalizePhone(raw)
  if (!normalized) return 'Enter a 10-digit US number or include + for international'
  return null
}
