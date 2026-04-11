// ── ICS 214 Accountability ───────────────────────────────────────────────────
//
// Single source of truth for activity-status logic used across:
//   • Event detail page (personnel summary)
//   • Roster page (per-person rows)
//   • Staff / assignment screen (FilledSlot + staging panel)
//
// HOW TO CHANGE THE THRESHOLD
//   Edit ACTIVE_THRESHOLD_MIN below.  Every page that imports it picks up the change.
//   Future: replace with a per-event or per-agency config loaded from the database.

/** Minutes of silence after which status degrades from ACTIVE → WARNING */
export const ACTIVE_THRESHOLD_MIN = 15

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivityStatus = 'active' | 'warning' | 'not_checked_in'

/**
 * Keyed by user_id (not assignment_id) so staging users who log while
 * unassigned are included in accountability status.
 * Value: ISO timestamp of the most recent ICS 214 entry for that user.
 */
export type LastEntryMap = Record<string, string>

// ── Status logic ─────────────────────────────────────────────────────────────

export function activityStatus(userId: string, map: LastEntryMap): ActivityStatus {
  const last = map[userId]
  if (!last) return 'not_checked_in'
  const mins = (Date.now() - new Date(last).getTime()) / 60_000
  return mins <= ACTIVE_THRESHOLD_MIN ? 'active' : 'warning'
}

// ── Display helpers ──────────────────────────────────────────────────────────

export const STATUS_DOT_COLOR: Record<ActivityStatus, string> = {
  active:          '#22C55E',  // green-500
  warning:         '#F59E0B',  // amber-500
  not_checked_in:  '#EF4444',  // red-500 — changed from dark gray so it reads as urgent
}

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  active:          'Active',
  warning:         'Warning',
  not_checked_in:  'Not checked in',
}

export function fmtAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Query helper ─────────────────────────────────────────────────────────────

/**
 * Given a Supabase client and an operational period ID, fetches the latest
 * activity entry per user and returns a LastEntryMap.
 *
 * Uses user_id (not assignment_id) so staging users are included.
 * Relies on the activity_entries_op_user_time index for efficiency.
 */
export async function fetchLastEntryMap(
  supabase: any,
  operationalPeriodId: string,
): Promise<LastEntryMap> {
  const { data } = await supabase
    .from('activity_entries')
    .select('user_id, entry_time')
    .eq('operational_period_id', operationalPeriodId)
    .order('entry_time', { ascending: false })

  const map: LastEntryMap = {}
  ;(data ?? []).forEach((e: { user_id: string; entry_time: string }) => {
    if (!map[e.user_id]) map[e.user_id] = e.entry_time
  })
  return map
}
