export interface RpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface AppToastInfo {
  message: string
  kind?: 'event' | 'task'
  id?: string
}

interface CalendarApi {
  call: (method: string, params: Record<string, unknown>) => Promise<RpcResult<unknown>>
  onDataChanged: (callback: (payload: { method: string }) => void) => () => void
  onAppToast: (callback: (payload: AppToastInfo | string) => void) => () => void
  windowMinimize: () => void
  windowToggleMaximize: () => void
  windowIsMaximized: () => Promise<boolean>
  printCalendar: () => Promise<boolean>
  onWindowStateChanged: (callback: (maximized: boolean) => void) => () => void
  windowClose: () => void
  openDataDir: () => Promise<string>
  backupData: () => Promise<string | null>
  restoreData: () => Promise<string | null>
  importIcs: () => Promise<number>
  chooseAvatar: () => Promise<string | null>
  getNotificationSettings: () => Promise<{ notificationsEnabled: boolean }>
  setNotificationSettings: (enabled: boolean) => Promise<{ notificationsEnabled: boolean }>
  getProfile: () => Promise<{ username: string; avatarColor: string; avatarImage: string | null }>
  setProfile: (profile: { username?: string; avatarColor?: string; avatarImage?: string | null }) => Promise<{ username: string; avatarColor: string; avatarImage: string | null }>
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
  priority: number
  sortOrder: number
  rrule: string | null
  exdates: string[]
  createdAt: string
  updatedAt: string
  status: 'needsAction' | 'completed'
}

export interface TrashInfo {
  id: string
  kind: 'event' | 'task'
  title: string
  deletedAt: string
}

export const api = {
  bootstrap: (from?: string, to?: string) => rpc<{ calendars: CalendarInfo[]; events: EventInfo[]; tasks: TaskInfo[]; taskOccurrences: TaskInfo[] }>('app.bootstrap', { from, to }),
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
  listTaskOccurrences: (from?: string, to?: string) => rpc<TaskInfo[]>('tasks.occurrences', { from, to }),
  createTask: (input: { title: string; notes?: string; dueAt?: string; reminderMinutes?: number | null; rrule?: string | null; priority?: number }) => rpc<TaskInfo>('tasks.create', input),
  updateTask: (id: string, patch: Record<string, unknown>) => rpc<TaskInfo | null>('tasks.update', { id, patch }),
  updateTaskOccurrence: (id: string, occurrenceIndex: number, patch: Record<string, unknown>) =>
    rpc<TaskInfo>('tasks.updateOccurrence', { id, occurrenceIndex, patch }),
  deleteTaskOccurrence: (id: string, occurrenceIndex: number) =>
    rpc<boolean>('tasks.deleteOccurrence', { id, occurrenceIndex }),
  deleteTask: (id: string) => rpc<boolean>('tasks.delete', { id }),
  reorderTasks: (ids: string[]) => rpc<boolean>('tasks.reorder', { ids }),
  listTrash: () => rpc<TrashInfo[]>('trash.list'),
  restoreTrash: (id: string) => rpc<boolean>('trash.restore', { id }),
  deleteTrash: (id: string) => rpc<boolean>('trash.delete', { id })
}
