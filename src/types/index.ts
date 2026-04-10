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
  created_at: string
  updated_at: string
  profile?: Profile
}

export type MapMarkerType = 'incident' | 'resource' | 'hazard'

export interface MapMarker {
  id: string
  event_id: string
  lat: number
  lng: number
  type: MapMarkerType
  title: string
  description: string | null
  created_by: string
  created_at: string
}

export interface UserLocation {
  id: string
  event_id: string
  user_id: string
  lat: number
  lng: number
  last_updated: string
}

export type BoundaryShape = 'circle' | 'rectangle' | 'polygon'
export type BoundaryZoneType = 'perimeter' | 'hazard_zone' | 'staging_area' | 'search_area'

export interface EventBoundary {
  id: string
  event_id: string
  shape: BoundaryShape
  /** circle: {center:[lat,lng], radiusMeters:number}
   *  rectangle: {bounds:[[swLat,swLng],[neLat,neLng]]}
   *  polygon: {points:[[lat,lng],...]} */
  geometry: Record<string, any>
  zone_type: BoundaryZoneType
  title: string
  description: string | null
  created_by: string
  created_at: string
}

// ── Meeting system ────────────────────────────────────────────

export interface EventMeeting {
  id: string
  event_id: string
  operational_period_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string
  location: string | null
  created_by: string
  created_at: string
  is_cancelled: boolean
}

export interface MeetingInvitee {
  id: string
  meeting_id: string
  user_id: string
  invited_at: string
}

export interface InAppNotification {
  id: string
  user_id: string
  event_id: string | null
  meeting_id: string | null
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

export type MeetingRsvpStatus = 'accepted' | 'maybe' | 'declined'

export interface MeetingRSVP {
  id: string
  meeting_id: string
  user_id: string
  status: MeetingRsvpStatus
  updated_at: string
}