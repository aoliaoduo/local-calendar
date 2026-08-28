export interface RpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

interface CalendarApi {
  call: (method: string, params: Record<string, unknown>) => Promise<RpcResult<unknown>>
  onDataChanged: (callback: (payload: { method: string }) => void) => () => void
  onAppToast: (callback: (message: string) => void) => () => void
  windowMinimize: () => void
  windowToggleMaximize: () => void
  windowIsMaximized: () => Promise<boolean>
  onWindowStateChanged: (callback: (maximized: boolean) => void) => () => void
  windowClose: () => void
  openDataDir: () => Promise<string>
  backupData: () => Promise<string | null>
  restoreData: () => Promise<string | null>
  importIcs: () => Promise<number>
  chooseAvatar: () => Promise<string | null>
}

declare global {
  interface Window {
    calendarApi: CalendarApi
  }
}

export async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const result = await window.calendarApi.call(method, params)
  if (!result.ok) throw new Error(result.error || '调用失败')
  return result.data as T
}

export interface CalendarInfo {
  id: string
  name: string
  color: string
  isPrimary: boolean
  isVisible: boolean
}

export interface ReminderInfo {
  minutes: number
  method: 'popup'
}

export interface EventInfo {
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
  reminders: ReminderInfo[]
}

export interface TaskInfo {
  id: string
  title: string
  notes: string | null
  dueAt: string | null
  reminderMinutes: number | null
  status: 'needsAction' | 'completed'
}

export const api = {
  listCalendars: () => rpc<CalendarInfo[]>('calendars.list'),
  createCalendar: (input: { name: string; color?: string }) => rpc<CalendarInfo>('calendars.create', input),
  updateCalendar: (id: string, patch: { name?: string; color?: string; isVisible?: boolean }) =>
    rpc<CalendarInfo | null>('calendars.update', { id, patch }),
  deleteCalendar: (id: string) => rpc<boolean>('calendars.delete', { id }),
  listEvents: (from?: string, to?: string) => rpc<EventInfo[]>('events.list', { from, to }),
  searchEvents: (query: string) => rpc<EventInfo[]>('events.search', { query }),
  createEvent: (input: Record<string, unknown>) => rpc<EventInfo>('events.create', input),
  updateEvent: (id: string, patch: Record<string, unknown>) => rpc<EventInfo | null>('events.update', { id, patch }),
  updateEventOccurrence: (id: string, occurrenceIndex: number, patch: Record<string, unknown>) =>
    rpc<EventInfo>('events.updateOccurrence', { id, occurrenceIndex, patch }),
  deleteEvent: (id: string) => rpc<boolean>('events.delete', { id }),
  deleteEventOccurrence: (id: string, occurrenceIndex: number) =>
    rpc<boolean>('events.deleteOccurrence', { id, occurrenceIndex }),
  listTasks: (status: 'needsAction' | 'completed' | 'all' = 'needsAction') =>
    rpc<TaskInfo[]>('tasks.list', { filter: { status } }),
  createTask: (input: { title: string; notes?: string; dueAt?: string; reminderMinutes?: number | null }) => rpc<TaskInfo>('tasks.create', input),
  updateTask: (id: string, patch: Record<string, unknown>) => rpc<TaskInfo | null>('tasks.update', { id, patch }),
  deleteTask: (id: string) => rpc<boolean>('tasks.delete', { id })
}
