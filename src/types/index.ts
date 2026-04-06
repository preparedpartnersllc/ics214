export type UserRole = 'admin' | 'supervisor' | 'member'
export type EventStatus = 'active' | 'closed' | 'archived'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  default_agency: string | null
  default_unit: string | null
  default_position: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  name: string
  incident_number: string | null
  location: string | null
  status: EventStatus
  op_period_start: string
  op_period_end: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface Assignment {
  id: string
  event_id: string
  user_id: string
  ics_position: string
  home_agency: string
  home_unit: string | null
  assigned_by: string
  assigned_at: string
  profile?: Profile
}

export interface ActivityEntry {
  id: string
  event_id: string
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