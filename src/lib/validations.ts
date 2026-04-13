import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const registerSchema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  default_agency: z.string().min(1, 'Select your agency'),
  default_unit: z.string().optional(),
  timezone: z.string().optional(),
})

export const createEventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  incident_number: z.string().optional(),
  location: z.string().optional(),
})

export const createOperationalPeriodSchema = z.object({
  op_period_start: z.string().min(1, 'Start time is required'),
  op_period_end: z.string().min(1, 'End time is required'),
}).refine(data => data.op_period_end > data.op_period_start, {
  message: 'End time must be after start time',
  path: ['op_period_end'],
})

export const createDivisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['division', 'branch']),
})

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  division_id: z.string().min(1, 'Division is required'),
})

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  group_id: z.string().min(1, 'Group is required'),
})

export const createAssignmentSchema = z.object({
  user_id: z.string().min(1, 'Select a member'),
  team_id: z.string().min(1, 'Select a team'),
  ics_position: z.string().min(1, 'Select a position'),
  home_agency: z.string().min(1, 'Agency is required'),
  home_unit: z.string().optional(),
})

export const activityEntrySchema = z.object({
  entry_time: z.string().min(1, 'Time is required'),
  narrative: z.string().min(3, 'Describe the activity').max(1000),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type CreateOperationalPeriodInput = z.infer<typeof createOperationalPeriodSchema>
export type CreateDivisionInput = z.infer<typeof createDivisionSchema>
export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type ActivityEntryInput = z.infer<typeof activityEntrySchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>