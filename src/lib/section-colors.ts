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
  command:    '#9CA3AF',
  operations: '#EF4444',
  planning:   '#EAB308',
  logistics:  '#3B82F6',
  finance:    '#22C55E',
} as const

/**
 * Returns the section accent color for a given ICS position value.
 * Agency Representatives get a subdued neutral (they span sections).
 * Anything unrecognised falls back to the same neutral.
 */
const SECTION_BY_POS: Record<string, keyof typeof SECTION_COLORS | 'neutral'> = {
  // Command Staff
  incident_commander:          'command',
  deputy_incident_commander:   'command',
  safety_officer:              'command',
  public_information_officer:  'command',
  liaison_officer:             'command',
  agency_representative:       'neutral',  // subdued per spec

  // Operations
  operations_section_chief:    'operations',
  operations_section_deputy:   'operations',
  branch_director:             'operations',
  division_supervisor:         'operations',
  division_group_supervisor:   'operations',
  group_supervisor:            'operations',
  team_leader:                 'operations',
  staging_area_manager:        'operations',
  air_ops_branch_director:     'operations',

  // Planning
  planning_section_chief:      'planning',
  planning_section_deputy:     'planning',
  resources_unit_leader:       'planning',
  situation_unit_leader:       'planning',
  documentation_unit_leader:   'planning',
  demobilization_unit_leader:  'planning',
  technical_specialist:        'planning',

  // Logistics
  logistics_section_chief:     'logistics',
  logistics_section_deputy:    'logistics',
  service_branch_director:     'logistics',
  communications_unit_leader:  'logistics',
  medical_unit_leader:         'logistics',
  food_unit_leader:            'logistics',
  support_branch_director:     'logistics',
  supply_unit_leader:          'logistics',
  facilities_unit_leader:      'logistics',
  ground_support_unit_leader:  'logistics',

  // Finance / Admin
  finance_admin_section_chief: 'finance',
  finance_admin_section_deputy:'finance',
  time_unit_leader:            'finance',
  procurement_unit_leader:     'finance',
  compensation_claims_unit_leader: 'finance',
  cost_unit_leader:            'finance',
}

const NEUTRAL = '#4B5563'

export function badgeColorForPosition(pos: string): string {
  const key = SECTION_BY_POS[pos]
  if (!key || key === 'neutral') return NEUTRAL
  return SECTION_COLORS[key]
}
