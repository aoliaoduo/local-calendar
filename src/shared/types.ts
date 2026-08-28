export interface Calendar {
  id: string
  name: string
  color: string
  isPrimary: boolean
  isVisible: boolean
  timeZone: string
  createdAt: string
  updatedAt: string
}

export interface CreateCalendarInput {
  name: string
  color?: string
  timeZone?: string
}

export type EventStatus = 'confirmed' | 'cancelled'

export interface Reminder {
  minutes: number
  method: 'popup'
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  description: string | null
  location: string | null
  startUtc: string
  endUtc: string
  isAllDay: boolean
  colorOverride: string | null
  rrule: string | null
  exdates: string[]
  status: EventStatus
  reminders: Reminder[]
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'needsAction' | 'completed'

export interface Task {
  id: string
  title: string
  notes: string | null
  dueAt: string | null
  reminderMinutes: number | null
  priority: number
  sortOrder: number
  rrule: string | null
  exdates: string[]
  completedAt: string | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

export interface CreateEventInput {
  calendarId?: string
  title: string
  description?: string
  location?: string
  start: string
  end: string
  isAllDay?: boolean
  colorOverride?: string
  reminders?: Reminder[]
  rrule?: string | null
}

export interface UpdateEventInput {
  title?: string
  description?: string | null
  location?: string | null
  start?: string
  end?: string
  isAllDay?: boolean
  calendarId?: string
  colorOverride?: string | null
  status?: EventStatus
  reminders?: Reminder[]
  rrule?: string | null
}

export interface CreateTaskInput {
  title: string
  notes?: string
  dueAt?: string
  reminderMinutes?: number | null
  priority?: number
  rrule?: string | null
}

export interface UpdateTaskInput {
  title?: string
  notes?: string | null
  dueAt?: string | null
  reminderMinutes?: number | null
  priority?: number
  rrule?: string | null
  completed?: boolean
}

export interface TrashItem {
  id: string
  kind: 'event' | 'task'
  title: string
  deletedAt: string
}

export interface RpcRequest {
  method: string
  params: Record<string, unknown>
}
