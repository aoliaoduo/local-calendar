import { DateTime } from 'luxon'
import type { Backend } from './backend'
import { CliError } from './errors'
import type { Calendar, CalendarEvent, Task } from '../shared/types'

export const WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function shortId(id: string): string {
  return id.slice(0, 8)
}

export function fmtEventLine(event: CalendarEvent, calendarName?: string): string {
  const start = DateTime.fromISO(event.startUtc).toLocal()
  const end = DateTime.fromISO(event.endUtc).toLocal()
  const when = event.isAllDay
    ? `${start.toFormat('yyyy-MM-dd')} 全天`
    : start.hasSame(end, 'day')
      ? `${start.toFormat('yyyy-MM-dd')} ${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`
      : `${start.toFormat('yyyy-MM-dd HH:mm')} – ${end.toFormat('yyyy-MM-dd HH:mm')}`
  const segments = [when, `${event.rrule ? '↻ ' : ''}${event.title}`]
  if (event.location) segments.push(`@ ${event.location}`)
  if (calendarName) segments.push(`[${calendarName}]`)
  segments.push(`id:${shortId(event.id)}`)
  return segments.join('  ')
}

export function fmtTaskLine(task: Task): string {
  const mark = task.status === 'completed' ? '[x]' : '[ ]'
  const due = task.dueAt ? ` 截止 ${DateTime.fromISO(task.dueAt).toLocal().toFormat('yyyy-MM-dd')}` : ''
  return `${mark} ${task.rrule ? '↻ ' : ''}${task.title}${due}  id:${shortId(task.id)}`
}

export function emitJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

export async function calendarNames(backend: Backend): Promise<Map<string, string>> {
  const calendars = await backend.call<Calendar[]>('calendars.list')
  return new Map(calendars.map((calendar) => [calendar.id, calendar.name]))
}

export async function resolveEvent(backend: Backend, prefix: string | undefined): Promise<CalendarEvent> {
  if (!prefix) throw new CliError('缺少日程 ID（先用 list 查看日程）')
  if (prefix.startsWith('holiday-')) throw new CliError('中国节假日为内置只读日历，无法修改')
  const base = prefix.split('#')[0]
  const events = await backend.call<CalendarEvent[]>('events.list', {})
  const matches = events.filter((event) => event.id === base || event.id.startsWith(base))
  if (matches.length === 0) throw new CliError(`未找到 ID 以 "${prefix}" 开头的日程`)
  if (matches.length > 1) throw new CliError(`ID 前缀 "${prefix}" 匹配到 ${matches.length} 个日程，请提供更长前缀`)
  return matches[0]
}

export async function resolveTask(backend: Backend, prefix: string | undefined): Promise<Task> {
  if (!prefix) throw new CliError('缺少待办 ID（先用 task list 查看）')
  const tasks = await backend.call<Task[]>('tasks.list', { filter: { status: 'all' } })
  const matches = tasks.filter((task) => task.id === prefix || task.id.startsWith(prefix))
  if (matches.length === 0) throw new CliError(`未找到 ID 以 "${prefix}" 开头的待办`)
  if (matches.length > 1) throw new CliError(`ID 前缀 "${prefix}" 匹配到 ${matches.length} 个待办，请提供更长前缀`)
  return matches[0]
}

export async function assertWritableCalendar(backend: Backend, id: string): Promise<void> {
  if (id === 'holidays') throw new CliError('中国节假日为只读日历，不能写入')
  const calendars = await backend.call<Calendar[]>('calendars.list')
  if (!calendars.some((calendar) => calendar.id === id)) {
    throw new CliError(`日历 "${id}" 不存在。可用: ${calendars.map((calendar) => `${calendar.id}(${calendar.name})`).join(' ')}`)
  }
}
