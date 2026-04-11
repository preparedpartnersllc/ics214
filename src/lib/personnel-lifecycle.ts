// ── Personnel lifecycle state ─────────────────────────────────────────────────
//
// State is DERIVED — not stored — from the combination of:
//   personnel_checkins + assignments + demob_requests records.
//
// State machine:
//   not_checked_in → staging (check-in action)
//   staging        → assigned (assignment created)
//   assigned       → pending_demob (demob request submitted)
//   pending_demob  → demobilized (all approvals complete)
//   any            → staging (assignment removed without demob)
//
// Assignment auto-creates a check-in record, so people assigned
// directly (without explicit check-in) still show as "Staging"
// if later unassigned rather than "Not checked in".

export type PersonnelStatus =
  | 'not_checked_in'  // no check-in record, no assignment
  | 'preassigned'     // assigned to a slot but not yet physically checked in
  | 'staging'         // checked in, no active assignment
  | 'assigned'        // checked in + active assignment (physically present)
  | 'pending_demob'   // active demob_request with status='pending'
  | 'demobilized'     // demob_request.status='approved', fully released

export const PERSONNEL_STATUS_LABEL: Record<PersonnelStatus, string> = {
  not_checked_in: 'Not checked in',
  preassigned:    'Preassigned',
  staging:        'Staging',
  assigned:       'Assigned',
  pending_demob:  'Pending demob',
  demobilized:    'Demobilized',
}

export const PERSONNEL_STATUS_COLOR: Record<PersonnelStatus, string> = {
  not_checked_in: '#4B5563',  // muted gray
  preassigned:    '#8B5CF6',  // violet-500 — planned but not present
  staging:        '#3B82F6',  // blue-500
  assigned:       '#22C55E',  // green-500
  pending_demob:  '#F59E0B',  // amber-500
  demobilized:    '#6B7280',  // gray-500
}

export const PERSONNEL_STATUS_BG: Record<PersonnelStatus, string> = {
  not_checked_in: '#4B556318',
  preassigned:    '#8B5CF618',
  staging:        '#3B82F618',
  assigned:       '#22C55E18',
  pending_demob:  '#F59E0B18',
  demobilized:    '#6B728018',
}

/**
 * Derive the display status for a person in a given OP.
 *
 * Priority (highest to lowest):
 *   demob states → pending_demob/demobilized
 *   assigned + checked in → assigned (physically present)
 *   assigned + NOT checked in → preassigned (slot held, not yet arrived)
 *   checked in + no assignment → staging
 *   neither → not_checked_in
 */
export function derivePersonnelStatus(
  userId: string,
  checkinSet:      Set<string>,
  assignedSet:     Set<string>,
  pendingDemobSet: Set<string>,
  demobilizedSet:  Set<string>,
): PersonnelStatus {
  if (demobilizedSet.has(userId))  return 'demobilized'
  if (pendingDemobSet.has(userId)) return 'pending_demob'
  if (assignedSet.has(userId))     return checkinSet.has(userId) ? 'assigned' : 'preassigned'
  if (checkinSet.has(userId))      return 'staging'
  return 'not_checked_in'
}

/** Common approver positions shown in the configuration UI. */
export const DEMOB_APPROVER_POSITION_OPTIONS = [
  { value: 'logistics_section_chief',    label: 'Logistics Section Chief'    },
  { value: 'finance_admin_section_chief',label: 'Finance / Admin Section Chief' },
  { value: 'operations_section_chief',   label: 'Operations Section Chief'   },
  { value: 'planning_section_chief',     label: 'Planning Section Chief'     },
  { value: 'safety_officer',             label: 'Safety Officer'             },
  { value: 'incident_commander',         label: 'Incident Commander'         },
]
