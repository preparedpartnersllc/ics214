/**
 * ICS section accent colors — single source of truth.
 * Used by Org Chart (staff board) and Personnel Roster to stay in sync.
 *
 * Authoritative values come from the Org Chart section headers:
 *   Command    → bg-[#9CA3AF]  (staff/page.tsx:1470)
 *   Operations → bg-[#EF4444]  (staff/page.tsx:1641)
 *   Planning   → #EAB308       (staff/page.tsx:1751)
 *   Logistics  → #3B82F6       (staff/page.tsx:1752)
 *   Finance    → #22C55E       (staff/page.tsx:1753)
 */
export const SECTION_COLORS = {
  command:   '#9CA3AF',
  operations: '#EF4444',
  planning:  '#EAB308',
  logistics: '#3B82F6',
  finance:   '#22C55E',
} as const
