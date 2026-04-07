export const ICS_POSITIONS = [
  { section: 'Command Staff', label: 'Incident Commander', value: 'incident_commander' },
  { section: 'Command Staff', label: 'Deputy Incident Commander', value: 'deputy_incident_commander' },
  { section: 'Command Staff', label: 'Safety Officer', value: 'safety_officer' },
  { section: 'Command Staff', label: 'Public Information Officer', value: 'public_information_officer' },
  { section: 'Command Staff', label: 'Liaison Officer', value: 'liaison_officer' },
  { section: 'Command Staff', label: 'Agency Representative', value: 'agency_representative' },
  { section: 'Planning Section', label: 'Planning Section Chief', value: 'planning_section_chief' },
  { section: 'Planning Section', label: 'Planning Section Deputy', value: 'planning_section_deputy' },
  { section: 'Planning Section', label: 'Resources Unit Leader', value: 'resources_unit_leader' },
  { section: 'Planning Section', label: 'Situation Unit Leader', value: 'situation_unit_leader' },
  { section: 'Planning Section', label: 'Documentation Unit Leader', value: 'documentation_unit_leader' },
  { section: 'Planning Section', label: 'Demobilization Unit Leader', value: 'demobilization_unit_leader' },
  { section: 'Planning Section', label: 'Technical Specialist', value: 'technical_specialist' },
  { section: 'Operations Section', label: 'Operations Section Chief', value: 'operations_section_chief' },
  { section: 'Operations Section', label: 'Operations Section Deputy', value: 'operations_section_deputy' },
  { section: 'Operations Section', label: 'Staging Area Manager', value: 'staging_area_manager' },
  { section: 'Operations Section', label: 'Branch Director', value: 'branch_director' },
  { section: 'Operations Section', label: 'Branch Deputy Director', value: 'branch_deputy_director' },
  { section: 'Operations Section', label: 'Division/Group Supervisor', value: 'division_group_supervisor' },
  { section: 'Operations Section', label: 'Air Operations Branch Director', value: 'air_ops_branch_director' },
  { section: 'Logistics Section', label: 'Logistics Section Chief', value: 'logistics_section_chief' },
  { section: 'Logistics Section', label: 'Logistics Section Deputy', value: 'logistics_section_deputy' },
  { section: 'Logistics Section', label: 'Support Branch Director', value: 'support_branch_director' },
  { section: 'Logistics Section', label: 'Supply Unit Leader', value: 'supply_unit_leader' },
  { section: 'Logistics Section', label: 'Facilities Unit Leader', value: 'facilities_unit_leader' },
  { section: 'Logistics Section', label: 'Ground Support Unit Leader', value: 'ground_support_unit_leader' },
  { section: 'Logistics Section', label: 'Service Branch Director', value: 'service_branch_director' },
  { section: 'Logistics Section', label: 'Communications Unit Leader', value: 'communications_unit_leader' },
  { section: 'Logistics Section', label: 'Medical Unit Leader', value: 'medical_unit_leader' },
  { section: 'Logistics Section', label: 'Food Unit Leader', value: 'food_unit_leader' },
  { section: 'Finance/Admin Section', label: 'Finance/Admin Section Chief', value: 'finance_admin_section_chief' },
  { section: 'Finance/Admin Section', label: 'Finance/Admin Section Deputy', value: 'finance_admin_section_deputy' },
  { section: 'Finance/Admin Section', label: 'Time Unit Leader', value: 'time_unit_leader' },
  { section: 'Finance/Admin Section', label: 'Procurement Unit Leader', value: 'procurement_unit_leader' },
  { section: 'Finance/Admin Section', label: 'Compensation/Claims Unit Leader', value: 'comp_claims_unit_leader' },
  { section: 'Finance/Admin Section', label: 'Cost Unit Leader', value: 'cost_unit_leader' },
]

export const POSITION_SECTIONS = [...new Set(ICS_POSITIONS.map(p => p.section))]

export function getPositionLabel(value: string): string {
  return ICS_POSITIONS.find(p => p.value === value)?.label ?? value
}