import type { CalendarService } from './service'

export type RpcHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>

export interface MethodTable {
  methods: Map<string, RpcHandler>
  mutating: Set<string>
}

export function createMethodTable(svc: CalendarService): MethodTable {
  const methods = new Map<string, RpcHandler>()
  const mutating = new Set<string>()
  const register = (name: string, isMutation: boolean, fn: RpcHandler): void => {
    methods.set(name, fn)
    if (isMutation) mutating.add(name)
  }

  register('calendars.list', false, () => svc.listCalendars())
  register('calendars.create', true, (p) => svc.createCalendar(p as never))
  register('calendars.update', true, (p) =>
    svc.updateCalendar(p.id as string, p.patch as { name?: string; color?: string; isVisible?: boolean })
  )
  register('calendars.delete', true, (p) => svc.deleteCalendar(p.id as string))
  register('events.create', true, (p) => svc.createEvent(p as never))
  register('events.get', false, (p) => svc.getEvent(p.id as string))
  register('events.list', false, (p) =>
    svc.listEvents(p.from as string | undefined, p.to as string | undefined, p.calendarId as string | undefined)
  )
  register('events.search', false, (p) => svc.searchEvents(p.query as string))
  register('events.update', true, (p) => svc.updateEvent(p.id as string, p.patch as never))
  register('events.updateOccurrence', true, (p) => svc.updateEventOccurrence(p.id as string, p.occurrenceIndex as number, p.patch as never))
  register('events.delete', true, (p) => svc.deleteEvent(p.id as string))
  register('events.deleteOccurrence', true, (p) => svc.deleteEventOccurrence(p.id as string, p.occurrenceIndex as number))
  register('tasks.create', true, (p) => svc.createTask(p as never))
  register('tasks.get', false, (p) => svc.getTask(p.id as string))
  register('tasks.list', false, (p) => svc.listTasks(p.filter as never))
  register('tasks.update', true, (p) => svc.updateTask(p.id as string, p.patch as never))
  register('tasks.delete', true, (p) => svc.deleteTask(p.id as string))
  register('agenda.today', false, () => svc.getTodayAgenda())

  return { methods, mutating }
}
