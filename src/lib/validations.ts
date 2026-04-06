import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const registerSchema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  default_agency: z.string().optional(),
  default_unit: z.string().optional(),
  default_position: z.string().optional(),
})

export const createEventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  incident_number: z.string().optional(),
  location: z.string().optional(),
  op_period_start: z.string().min(1, 'Start time is required'),
  op_period_end: z.string().min(1, 'End time is required'),
}).refine(data => data.op_period_end > data.op_period_start, {
  message: 'End time must be after start time',
  path: ['op_period_end'],
})

export const activityEntrySchema = z.object({
  entry_time: z.string().min(1, 'Time is required'),
  narrative: z.string().min(3, 'Describe the activity').max(1000),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type ActivityEntryInput = z.infer<typeof activityEntrySchema>