export type UserRole = 'admin' | 'supervisor' | 'member'
export type EventStatus = 'active' | 'closed' | 'archived'
export type OPStatus = 'active' | 'closed'
export type DivisionType = 'division' | 'branch'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  default_agency: string | null
  default_unit: string | null
  default_position: string | null
  timezone: string | null
  phone: string | null
  is_active: boolean
  notes: string | null
  last_active_at: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  name: string
  incident_number: string | null
  location: string | null
  summary: string | null
  status: EventStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface OperationalPeriod {
  id: string
  event_id: string
  period_number: number
  op_period_start: string
  op_period_end: string
  status: OPStatus
  created_by: string
  created_at: string
}

export interface Division {
  id: string
  operational_period_id: string
  name: string
  type: DivisionType
  created_at: string
}

export interface Group {
  id: string
  operational_period_id: string
  division_id: string | null
  name: string
  created_at: string
}

export interface Team {
  id: string
  operational_period_id: string
  group_id: string | null
  division_id: string | null
  name: string
  created_at: string
}

export interface Assignment {
  id: string
  operational_period_id: string
  team_id: string
  user_id: string
  ics_position: string
  home_agency: string
  home_unit: string | null
  division_id: string | null
  assigned_by: string
  assigned_at: string
  profile?: Profile
  team?: Team
}

export interface ActivityEntry {
  id: string
  operational_period_id: string
  assignment_id: string
  user_id: string
  entry_time: string
  narrative: string
  reviewed: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  profile?: Profile
}