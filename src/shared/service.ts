import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { DateTime } from 'luxon'
import type { DB } from './db'
import { getHolidays, HOLIDAY_CALENDAR_ID } from './lunar'
import { AttachmentRepository } from './attachment-repository'
import type {
  Calendar,
  CalendarEvent,
  Attachment,
  CreateAttachmentInput,
  CreateCalendarInput,
  CreateEventInput,
  CreateTaskInput,
  Reminder,
  Task,
  TrashItem,
  UpdateEventInput,
  UpdateTaskInput
} from './types'

export const EVENT_COLORS = [
  { key: 'tomato', hex: '#d50000' },
  { key: 'flamingo', hex: '#e67c73' },
  { key: 'tangerine', hex: '#f4511e' },
  { key: 'banana', hex: '#f9ab00' },
  { key: 'sage', hex: '#0b8043' },
  { key: 'peacock', hex: '#039be5' },
  { key: 'blueberry', hex: '#3f51b5' },
  { key: 'lavender', hex: '#7986cb' },
  { key: 'grape', hex: '#8e24aa' },
  { key: 'graphite', hex: '#616161' }
] as const

function nowIso(): string {
  return new Date().toISOString()
}

function parseWhen(value: string, endOfDay = false): DateTime | null {
  if (!value) return null
  let dt = DateTime.fromISO(value, { zone: 'local' })
  if (!dt.isValid) dt = DateTime.fromSQL(value, { zone: 'local' })
  if (!dt.isValid) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    dt = endOfDay ? dt.endOf('day') : dt.startOf('day')
  }
  return dt
}

const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

export interface ParsedRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byday: number[]
  until: DateTime | null
  count: number | null
}

export function parseRule(rrule: string): ParsedRule | null {
  let freq: ParsedRule['freq'] | null = null
  let interval = 1
  let byday: number[] = []
  let until: DateTime | null = null
  let count: number | null = null
  const applyFreq = (v: string): void => {
    if (v === 'DAILY' || v === 'WEEKLY' || v === 'MONTHLY' || v === 'YEARLY') freq = v
  }
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) {
      applyFreq(part.trim().toUpperCase())
      continue
    }
    const key = part.slice(0, eq).trim().toUpperCase()
    const val = part.slice(eq + 1).trim()
    if (key === 'FREQ') {
      applyFreq(val.toUpperCase())
    } else if (key === 'INTERVAL') {
      const n = Number(val)
      if (Number.isInteger(n) && n >= 1) interval = n
    } else if (key === 'BYDAY') {
      byday = val
        .split(',')
        .map((d) => DAY_CODES.indexOf(d.trim().toUpperCase()))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)
    } else if (key === 'UNTIL') {
      const u = DateTime.fromISO(val, { zone: 'local' })
      if (u.isValid) until = u.endOf('day')
    } else if (key === 'COUNT') {
      const n = Number(val)
      if (Number.isInteger(n) && n >= 1) count = n
    }
  }
  return freq ? { freq, interval, byday, until, count } : null
}

function* ruleOccurrences(rule: ParsedRule, origStart: DateTime): Generator<DateTime> {
  if (rule.freq === 'WEEKLY' && rule.byday.length) {
    const week0 = origStart.startOf('week')
    const timeOfDay = origStart.toMillis() - origStart.startOf('day').toMillis()
    for (let w = 0; w < 600; w++) {
      for (const d of rule.byday) {
        const occ = week0.plus({ weeks: w * rule.interval, days: d, milliseconds: timeOfDay })
        if (occ >= origStart) yield occ
      }
    }
    return
  }
  const unit = rule.freq === 'DAILY' ? 'days' : rule.freq === 'WEEKLY' ? 'weeks' : rule.freq === 'MONTHLY' ? 'months' : 'years'
  for (let n = 0; n <= 1500; n++) {
    yield origStart.plus({ [unit]: n * rule.interval })
  }
}

function expandRecurring(evt: CalendarEvent, from: DateTime, to: DateTime): CalendarEvent[] {
  const rule = evt.rrule ? parseRule(evt.rrule) : null
  if (!rule) return [evt]
  const origStart = DateTime.fromISO(evt.startUtc).toLocal()
  const durMs = DateTime.fromISO(evt.endUtc).toMillis() - origStart.toMillis()
  const out: CalendarEvent[] = []
  let idx = 0
  for (const occ of ruleOccurrences(rule, origStart)) {
    if (rule.count !== null && idx >= rule.count) break
    if (rule.until && occ > rule.until) break
    if (occ > to) break
    if ((evt.exdates ?? []).includes(occ.toUTC().toISO()!)) {
      idx++
      continue
    }
    if (occ.plus({ milliseconds: durMs }) > from) {
      out.push({
        ...evt,
        id: `${evt.id}#${idx}`,
        startUtc: occ.toUTC().toISO()!,
        endUtc: occ.plus({ milliseconds: durMs }).toUTC().toISO()!
      })
    }
    idx++
    if (out.length >= 500) break
  }
  return out
}

function recurringOccurrence(evt: CalendarEvent, occurrenceIndex: number): { start: DateTime; end: DateTime } | null {
  if (!evt.rrule || !Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) return null
  const rule = parseRule(evt.rrule)
  if (!rule) return null
  const origStart = DateTime.fromISO(evt.startUtc).toLocal()
  const duration = DateTime.fromISO(evt.endUtc).toMillis() - DateTime.fromISO(evt.startUtc).toMillis()
  let index = 0
  for (const occurrence of ruleOccurrences(rule, origStart)) {
    if (rule.count !== null && index >= rule.count) break
    if (rule.until && occurrence > rule.until) break
    if (index === occurrenceIndex) {
      return { start: occurrence, end: occurrence.plus({ milliseconds: duration }) }
    }
    index++
  }
  return null
}

function normalizeReminders(value: Reminder[] | undefined): Reminder[] {
  const reminders = new Map<number, Reminder>()
  for (const reminder of value ?? []) {
    if (Number.isInteger(reminder.minutes) && reminder.minutes >= 0 && reminder.minutes <= 10080) {
      reminders.set(reminder.minutes, { minutes: reminder.minutes, method: 'popup' })
    }
  }
  return [...reminders.values()].sort((first, second) => second.minutes - first.minutes)
}

function normalizeTaskReminder(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 10080) throw new Error('任务提醒分钟数必须是 0–10080 的整数')
  return value
}

function normalizeTaskPriority(value: number | undefined): number {
  const priority = value ?? 0
  if (!Number.isInteger(priority) || priority < -1 || priority > 1) throw new Error('任务优先级必须是 -1、0 或 1')
  return priority
}

function parseExdates(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === 'string'))] : []
  } catch {
    return []
  }
}

function rowToCalendar(r: Record<string, unknown>): Calendar {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    isPrimary: !!r.is_primary,
    isVisible: !!r.is_visible,
    timeZone: r.time_zone as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string
  }
}

function rowToEvent(r: Record<string, unknown>): CalendarEvent {
  let reminders: Reminder[] = []
  try {
    const parsed = JSON.parse((r.reminders as string) || '[]') as unknown
    if (Array.isArray(parsed)) {
      reminders = parsed
        .filter((item): item is { minutes: number; method?: string } => !!item && typeof item === 'object')
        .map((item) => ({ minutes: Number(item.minutes), method: 'popup' as const }))
        .filter((item) => Number.isInteger(item.minutes) && item.minutes >= 0 && item.minutes <= 10080)
    }
  } catch {
    reminders = []
  }
  return {
    id: r.id as string,
    calendarId: r.calendar_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    startUtc: r.start_utc as string,
    endUtc: r.end_utc as string,
    isAllDay: !!r.is_all_day,
    colorOverride: (r.color_override as string | null) ?? null,
    rrule: (r.rrule as string | null) ?? null,
    exdates: parseExdates(r.exdates),
    status: r.status as CalendarEvent['status'],
    reminders,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string
  }
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    title: r.title as string,
    notes: (r.notes as string | null) ?? null,
    dueAt: (r.due_at as string | null) ?? null,
    reminderMinutes: typeof r.reminder_minutes === 'number' ? r.reminder_minutes : null,
    priority: typeof r.priority === 'number' ? r.priority : 0,
    sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 0,
    rrule: (r.rrule as string | null) ?? null,
    exdates: parseExdates(r.exdates),
    completedAt: (r.completed_at as string | null) ?? null,
    status: r.status as Task['status'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string
  }
}

export class CalendarService {
  private db: DB
  private attachments: AttachmentRepository

  constructor(db: DB) {
    this.db = db
    this.attachments = new AttachmentRepository(db, (kind, id) => kind === 'event' ? this.getEvent(id) !== null : this.getTask(id) !== null)
  }

  getBootstrap(from?: string, to?: string): { calendars: Calendar[]; events: CalendarEvent[]; tasks: Task[]; taskOccurrences: Task[] } {
    return {
      calendars: this.listCalendars(),
      events: this.listEvents(from, to),
      tasks: this.listTasks({ status: 'all' }),
      taskOccurrences: this.listTaskOccurrences(from, to)
    }
  }

  async backupTo(destination: string): Promise<void> {
    await this.db.backup(destination)
  }

  restoreFrom(source: string, destination: string): void {
    const header = readFileSync(source).subarray(0, 16).toString('utf8')
    if (header !== 'SQLite format 3\u0000') throw new Error('备份文件不是有效的 SQLite 数据库')
    this.db.close()
    const suffix = `${process.pid}-${Date.now()}`
    const staged = `${destination}.restore-${suffix}.tmp`
    const previous = `${destination}.restore-${suffix}.previous`
    copyFileSync(source, staged)
    try {
      if (existsSync(destination)) renameSync(destination, previous)
      renameSync(staged, destination)
      rmSync(`${destination}-wal`, { force: true })
      rmSync(`${destination}-shm`, { force: true })
      rmSync(previous, { force: true })
    } catch (error) {
      if (!existsSync(destination) && existsSync(previous)) renameSync(previous, destination)
      throw error
    } finally {
      rmSync(staged, { force: true })
    }
  }

  // ---------- calendars ----------

  listCalendars(): Calendar[] {
    return (this.db.prepare('SELECT * FROM calendars ORDER BY is_primary DESC, name').all() as Record<string, unknown>[]).map(rowToCalendar)
  }

  createCalendar(input: CreateCalendarInput): Calendar {
    const name = input.name.trim()
    if (!name) throw new Error('日历名称不能为空')
    if (name.length > 40) throw new Error('日历名称不能超过 40 个字符')
    const color = input.color?.trim() || '#1a73e8'
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('日历颜色格式无效')
    const id = `cal-${randomUUID()}`
    const now = nowIso()
    this.db.prepare(
      'INSERT INTO calendars (id, name, color, is_primary, is_visible, time_zone, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?)'
    ).run(id, name, color, input.timeZone?.trim() || 'Asia/Shanghai', now, now)
    return this.getCalendar(id)!
  }

  updateCalendar(id: string, patch: { name?: string; color?: string; isVisible?: boolean }): Calendar | null {
    const cur = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!cur) throw new Error(`日历不存在: ${id}`)
    if (id === HOLIDAY_CALENDAR_ID) {
      if (patch.name !== undefined || patch.color !== undefined) throw new Error('中国节假日为内置只读日历，不能修改名称或颜色')
      const isVisible = patch.isVisible ?? !!cur.is_visible
      this.db.prepare('UPDATE calendars SET is_visible = ?, updated_at = ? WHERE id = ?').run(isVisible ? 1 : 0, nowIso(), id)
      return this.getCalendar(id)
    }
    const name = patch.name !== undefined ? patch.name.trim() : (cur.name as string)
    if (!name) throw new Error('日历名称不能为空')
    const color = patch.color ?? (cur.color as string)
    const isVisible = patch.isVisible ?? !!cur.is_visible
    this.db
      .prepare('UPDATE calendars SET name = ?, color = ?, is_visible = ?, updated_at = ? WHERE id = ?')
      .run(name, color, isVisible ? 1 : 0, nowIso(), id)
    return this.getCalendar(id)
  }

  deleteCalendar(id: string): boolean {
    const calendar = this.getCalendar(id)
    if (!calendar) throw new Error(`日历不存在: ${id}`)
    if (calendar.isPrimary || id === HOLIDAY_CALENDAR_ID) throw new Error('默认日历和节假日日历不能删除')
    const fallback = this.getCalendar('personal')
    if (!fallback) throw new Error('缺少默认个人日历')
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE events SET calendar_id = ?, updated_at = ? WHERE calendar_id = ?').run(fallback.id, nowIso(), id)
      return this.db.prepare('DELETE FROM calendars WHERE id = ?').run(id).changes > 0
    })
    return tx()
  }

  getCalendar(id: string): Calendar | null {
    const r = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? rowToCalendar(r) : null
  }

  // ---------- events ----------

  createEvent(input: CreateEventInput): CalendarEvent {
    const start = parseWhen(input.start)
    if (input.end && !parseWhen(input.end)) throw new Error(`无法解析结束时间: "${input.end}"`)
    let end = input.end ? parseWhen(input.end) : null
    if (!start) throw new Error(`无法解析开始时间: "${input.start}"（支持 ISO 8601，如 2026-08-28T14:00:00 或 2026-08-28）`)
    const isAllDay = input.isAllDay ?? /^\d{4}-\d{2}-\d{2}$/.test(input.start.trim())
    if (!end) end = isAllDay ? start.endOf('day') : start.plus({ hours: 1 })
    if (end <= start) throw new Error('结束时间必须晚于开始时间')
    if (input.calendarId && !this.getCalendar(input.calendarId)) throw new Error(`日历不存在: ${input.calendarId}`)
    const calId = input.calendarId || 'personal'
    if (calId === HOLIDAY_CALENDAR_ID) throw new Error('中国节假日为内置只读日历，不能写入')
    const reminders = normalizeReminders(input.reminders)
    const rrule = input.rrule?.trim() || null
    if (rrule && !parseRule(rrule)) throw new Error(`无法解析重复规则: "${input.rrule}"（如 DAILY / WEEKLY / WEEKLY;BYDAY=MO,WE / MONTHLY / YEARLY，可加 ;INTERVAL=n / ;UNTIL=2026-12-31 / ;COUNT=n）`)
    const id = randomUUID()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO events (id, calendar_id, title, description, location, start_utc, end_utc, is_all_day, color_override, rrule, exdates, status, reminders, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`
      )
      .run(
        id,
        calId,
        input.title.trim() || '（无标题）',
        input.description ?? null,
        input.location ?? null,
        start.toUTC().toISO(),
        end.toUTC().toISO(),
        isAllDay ? 1 : 0,
        input.colorOverride ?? null,
        rrule,
        '[]',
        JSON.stringify(reminders),
        now,
        now
      )
    return this.getEvent(id)!
  }

  getEvent(id: string): CalendarEvent | null {
    const r = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? rowToEvent(r) : null
  }

  listEvents(from?: string, to?: string, calendarId?: string): CalendarEvent[] {
    const conds: string[] = ["status = 'confirmed'"]
    const args: unknown[] = []
    let rangeFrom: DateTime | null = null
    let rangeTo: DateTime | null = null
    if (from) {
      const f = parseWhen(from)
      if (f) {
        conds.push('end_utc > ?')
        args.push(f.toUTC().toISO())
        rangeFrom = f
      }
    }
    if (to) {
      const t = parseWhen(to, true)
      if (t) {
        conds.push('start_utc <= ?')
        args.push(t.toUTC().toISO())
        rangeTo = t
      }
    }
    if (calendarId) {
      conds.push('calendar_id = ?')
      args.push(calendarId)
    }
    const windowed = rangeFrom !== null && rangeTo !== null
    if (windowed) conds.push('rrule IS NULL')
    const rows = this.db
      .prepare(`SELECT * FROM events WHERE ${conds.join(' AND ')} ORDER BY start_utc`)
      .all(...args) as Record<string, unknown>[]
    const events = rows.map(rowToEvent)
    if (windowed) {
      const recArgs: unknown[] = []
      const recConds = ["status = 'confirmed'", 'rrule IS NOT NULL']
      if (calendarId) {
        recConds.push('calendar_id = ?')
        recArgs.push(calendarId)
      }
      const recurring = this.db
        .prepare(`SELECT * FROM events WHERE ${recConds.join(' AND ')} ORDER BY start_utc`)
        .all(...recArgs) as Record<string, unknown>[]
      for (const r of recurring) {
        events.push(...expandRecurring(rowToEvent(r), rangeFrom!, rangeTo!))
      }
      if (calendarId !== HOLIDAY_CALENDAR_ID) {
        events.push(...this.holidayEvents(rangeFrom!, rangeTo!))
      }
      events.sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    }
    return events
  }

  private holidayEvents(from: DateTime, to: DateTime): CalendarEvent[] {
    const start = from.startOf('day')
    const end = to.endOf('day')
    if (end <= start) return []
    return getHolidays(start, end).map((h) => {
      const dayStart = DateTime.fromISO(h.date).startOf('day')
      return {
        id: `holiday-${h.date}`,
        calendarId: HOLIDAY_CALENDAR_ID,
        title: h.name,
        description: null,
        location: null,
        startUtc: dayStart.toUTC().toISO()!,
        endUtc: dayStart.endOf('day').toUTC().toISO()!,
        isAllDay: true,
        colorOverride: null,
        rrule: null,
        exdates: [],
        status: 'confirmed' as const,
        reminders: [],
        createdAt: dayStart.toISO()!,
        updatedAt: dayStart.toISO()!
      }
    })
  }

  searchEvents(query: string): CalendarEvent[] {
    const q = `%${query.trim()}%`
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE status = 'confirmed' AND (title LIKE ? OR description LIKE ? OR location LIKE ?) ORDER BY start_utc LIMIT 100"
      )
      .all(q, q, q) as Record<string, unknown>[]
    return rows.map(rowToEvent)
  }

  searchTasks(query: string): Task[] {
    const q = `%${query.trim()}%`
    const rows = this.db
      .prepare("SELECT * FROM tasks WHERE title LIKE ? OR notes LIKE ? ORDER BY status, due_at IS NULL, due_at, sort_order LIMIT 100")
      .all(q, q) as Record<string, unknown>[]
    return rows.map(rowToTask)
  }

  updateEvent(id: string, patch: UpdateEventInput): CalendarEvent | null {
    const cur = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!cur) throw new Error(`日程不存在: ${id}`)
    let startUtc = cur.start_utc as string
    let endUtc = cur.end_utc as string
    if (patch.start) {
      const s = parseWhen(patch.start)
      if (!s) throw new Error(`无法解析开始时间: "${patch.start}"`)
      startUtc = s.toUTC().toISO()!
    }
    if (patch.end) {
      const e = parseWhen(patch.end)
      if (!e) throw new Error(`无法解析结束时间: "${patch.end}"`)
      endUtc = e.toUTC().toISO()!
    }
    if (DateTime.fromISO(endUtc) <= DateTime.fromISO(startUtc)) throw new Error('结束时间必须晚于开始时间')
    const title = patch.title ?? (cur.title as string)
    const description = patch.description !== undefined ? patch.description : (cur.description as string | null)
    const location = patch.location !== undefined ? patch.location : (cur.location as string | null)
    const isAllDay = patch.isAllDay ?? !!cur.is_all_day
    const calendarId = patch.calendarId ?? (cur.calendar_id as string)
    if (calendarId === HOLIDAY_CALENDAR_ID) throw new Error('中国节假日为内置只读日历，不能写入')
    const colorOverride = patch.colorOverride !== undefined ? patch.colorOverride : (cur.color_override as string | null)
    const status = patch.status ?? (cur.status as string)
    const currentEvent = rowToEvent(cur)
    const reminders = patch.reminders !== undefined ? normalizeReminders(patch.reminders) : currentEvent.reminders
    let rrule: string | null
    if (patch.rrule !== undefined) {
      rrule = patch.rrule?.trim() || null
      if (rrule && !parseRule(rrule)) throw new Error(`无法解析重复规则: "${patch.rrule}"`)
    } else {
      rrule = (cur.rrule as string | null) ?? null
    }
    this.db
      .prepare(
        `UPDATE events SET title = ?, description = ?, location = ?, start_utc = ?, end_utc = ?, is_all_day = ?, calendar_id = ?, color_override = ?, status = ?, reminders = ?, rrule = ?, exdates = ?, updated_at = ? WHERE id = ?`
      )
      .run(title, description, location, startUtc, endUtc, isAllDay ? 1 : 0, calendarId, colorOverride, status, JSON.stringify(reminders), rrule, JSON.stringify(currentEvent.exdates), nowIso(), id)
    return this.getEvent(id)
  }

  deleteEventOccurrence(id: string, occurrenceIndex: number): boolean {
    const event = this.getEvent(id)
    if (!event) throw new Error(`日程不存在: ${id}`)
    const occurrence = recurringOccurrence(event, occurrenceIndex)
    if (!occurrence) throw new Error('重复日程实例不存在')
    const exdates = [...new Set([...event.exdates, occurrence.start.toUTC().toISO()!])]
    this.db.prepare('UPDATE events SET exdates = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(exdates), nowIso(), id)
    return true
  }

  updateEventOccurrence(id: string, occurrenceIndex: number, patch: UpdateEventInput): CalendarEvent {
    const event = this.getEvent(id)
    if (!event) throw new Error(`日程不存在: ${id}`)
    const occurrence = recurringOccurrence(event, occurrenceIndex)
    if (!occurrence) throw new Error('重复日程实例不存在')
    const standalone = this.createEvent({
      title: patch.title ?? event.title,
      description: patch.description !== undefined ? patch.description ?? undefined : event.description ?? undefined,
      location: patch.location !== undefined ? patch.location ?? undefined : event.location ?? undefined,
      start: patch.start ?? occurrence.start.toUTC().toISO()!,
      end: patch.end ?? occurrence.end.toUTC().toISO()!,
      isAllDay: patch.isAllDay ?? event.isAllDay,
      calendarId: patch.calendarId ?? event.calendarId,
      colorOverride: patch.colorOverride !== undefined ? patch.colorOverride ?? undefined : event.colorOverride ?? undefined,
      reminders: patch.reminders ?? event.reminders,
      rrule: null
    })
    try {
      this.deleteEventOccurrence(id, occurrenceIndex)
    } catch (error) {
      this.deleteEvent(standalone.id)
      throw error
    }
    return standalone
  }

  deleteEvent(id: string): boolean {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return false
    this.db.prepare('INSERT INTO trash (id, kind, title, payload, deleted_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), 'event', row.title as string, JSON.stringify(row), nowIso())
    return this.db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0
  }

  // ---------- tasks ----------

  createTask(input: CreateTaskInput): Task {
    if (input.dueAt && !parseWhen(input.dueAt, true)) throw new Error(`无法解析任务截止时间: "${input.dueAt}"`)
    const due = input.dueAt ? parseWhen(input.dueAt, true) : null
    const rrule = input.rrule?.trim() || null
    if (rrule && !parseRule(rrule)) throw new Error(`无法解析任务重复规则: "${input.rrule}"`)
    const id = randomUUID()
    const now = nowIso()
    const reminderMinutes = input.reminderMinutes !== undefined && input.reminderMinutes !== null
      ? normalizeTaskReminder(input.reminderMinutes)
      : input.reminderMinutes === undefined && input.dueAt
        ? /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt.trim()) ? 900 : 0
        : null
    const priority = normalizeTaskPriority(input.priority)
    const parentId = input.parentId?.trim() || null
    if (parentId) {
      const parent = this.getTask(parentId)
      if (!parent) throw new Error('父任务不存在')
      if (parent.parentId) throw new Error('子任务暂不支持继续嵌套')
    }
    this.db
      .prepare('INSERT INTO tasks (id, parent_id, title, notes, due_at, reminder_minutes, priority, sort_order, rrule, exdates, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, parentId, input.title.trim() || '（无标题）', input.notes ?? null, due ? due.toUTC().toISO() : null, reminderMinutes, priority, Date.now(), rrule, '[]', 'needsAction', now, now)
    return this.getTask(id)!
  }

  getTask(id: string): Task | null {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? rowToTask(r) : null
  }

  listTasks(filter?: { status?: 'needsAction' | 'completed' | 'all'; dueBefore?: string }): Task[] {
    let sql = 'SELECT * FROM tasks'
    const conds: string[] = []
    const args: unknown[] = []
    if (filter?.status && filter.status !== 'all') {
      conds.push('status = ?')
      args.push(filter.status)
    }
    if (filter?.dueBefore) {
      const d = parseWhen(filter.dueBefore, true)
      if (d) {
        conds.push('due_at <= ?')
        args.push(d.toUTC().toISO())
      }
    }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
    sql += " ORDER BY completed_at IS NULL DESC, sort_order, priority DESC, due_at IS NULL, due_at, created_at"
    const rows = this.db.prepare(sql).all(...args) as Record<string, unknown>[]
    return rows.map(rowToTask)
  }

  updateTask(id: string, patch: UpdateTaskInput): Task | null {
    const cur = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!cur) throw new Error(`待办不存在: ${id}`)
    const title = patch.title ?? (cur.title as string)
    const notes = patch.notes !== undefined ? patch.notes : (cur.notes as string | null)
    let parentId = (cur.parent_id as string | null) ?? null
    if (patch.parentId !== undefined) {
      parentId = patch.parentId?.trim() || null
      if (parentId) {
        if (parentId === id) throw new Error('任务不能设为自己的子任务')
        const parent = this.getTask(parentId)
        if (!parent) throw new Error('父任务不存在')
        if (parent.parentId) throw new Error('子任务暂不支持继续嵌套')
      }
    }
    let dueAt = cur.due_at as string | null
    if (patch.dueAt !== undefined) {
      if (patch.dueAt && !parseWhen(patch.dueAt, true)) throw new Error(`无法解析任务截止时间: "${patch.dueAt}"`)
      const d = patch.dueAt ? parseWhen(patch.dueAt, true) : null
      dueAt = d ? d.toUTC().toISO() : null
    }
    const reminderMinutes = patch.reminderMinutes !== undefined
      ? (patch.reminderMinutes === null ? null : normalizeTaskReminder(patch.reminderMinutes))
      : (typeof cur.reminder_minutes === 'number' ? cur.reminder_minutes : null)
    const priority = patch.priority !== undefined ? normalizeTaskPriority(patch.priority) : (typeof cur.priority === 'number' ? cur.priority : 0)
    const rrule = patch.rrule !== undefined ? (patch.rrule?.trim() || null) : ((cur.rrule as string | null) ?? null)
    if (rrule && !parseRule(rrule)) throw new Error(`无法解析任务重复规则: "${patch.rrule}"`)
    let status = cur.status as string
    let completedAt = cur.completed_at as string | null
    if (patch.completed !== undefined) {
      if (patch.completed) {
        status = 'completed'
        completedAt = nowIso()
      } else {
        status = 'needsAction'
        completedAt = null
      }
    }
    const exdates = (patch.dueAt !== undefined || patch.rrule !== undefined) ? [] : parseExdates(cur.exdates)
    this.db
      .prepare('UPDATE tasks SET parent_id = ?, title = ?, notes = ?, due_at = ?, reminder_minutes = ?, priority = ?, rrule = ?, exdates = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
      .run(parentId, title, notes, dueAt, reminderMinutes, priority, rrule, JSON.stringify(exdates), status, completedAt, nowIso(), id)
    return this.getTask(id)
  }

  deleteTask(id: string): boolean {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return false
    const rows = [row, ...(this.db.prepare('SELECT * FROM tasks WHERE parent_id = ?').all(id) as Record<string, unknown>[])]
    const saveTrash = this.db.prepare('INSERT INTO trash (id, kind, title, payload, deleted_at) VALUES (?, ?, ?, ?, ?)')
    const remove = this.db.prepare('DELETE FROM tasks WHERE id = ?')
    this.db.transaction(() => {
      for (const task of rows) saveTrash.run(randomUUID(), 'task', task.title as string, JSON.stringify(task), nowIso())
      for (const task of [...rows].reverse()) remove.run(task.id)
    })()
    return true
  }

  reorderTasks(ids: string[]): boolean {
    const current = this.listTasks({ status: 'all' })
    const requested = [...new Set(ids)].filter((id) => current.some((task) => task.id === id))
    const order = [...requested, ...current.map((task) => task.id).filter((id) => !requested.includes(id))]
    const update = this.db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?')
    this.db.transaction(() => {
      order.forEach((id, index) => update.run(index, nowIso(), id))
    })()
    return true
  }

  listTaskOccurrences(from?: string, to?: string): Task[] {
    const start = from ? (parseWhen(from, false) ?? DateTime.now().startOf('day')) : DateTime.now().startOf('day')
    const end = to ? (parseWhen(to, true) ?? start.plus({ days: 42 })) : start.plus({ days: 42 })
    const output: Task[] = []
    for (const task of this.listTasks({ status: 'all' })) {
      if (!task.dueAt) continue
      const due = DateTime.fromISO(task.dueAt).toLocal().startOf('day')
      if (!task.rrule) {
        if (due >= start.startOf('day') && due <= end.endOf('day')) output.push(task)
        continue
      }
      const rule = parseRule(task.rrule)
      if (!rule) {
        if (due >= start.startOf('day') && due <= end.endOf('day')) output.push(task)
        continue
      }
      let idx = 0
      for (const occurrence of ruleOccurrences(rule, due)) {
        if (rule.count !== null && idx >= rule.count) break
        if (rule.until && occurrence > rule.until) break
        if (occurrence > end.endOf('day')) break
        const occurrenceIso = occurrence.toUTC().toISO()!
        if ((task.exdates ?? []).includes(occurrenceIso)) {
          idx++
          continue
        }
        if (occurrence >= start.startOf('day')) {
          output.push({ ...task, id: `${task.id}#${idx}`, dueAt: occurrenceIso })
        }
        idx++
        if (idx > 1500) break
      }
    }
    return output
  }

  private recurringTaskOccurrence(task: Task, occurrenceIndex: number): DateTime | null {
    if (!task.rrule || !task.dueAt || !Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) return null
    const rule = parseRule(task.rrule)
    if (!rule) return null
    const first = DateTime.fromISO(task.dueAt).toLocal().startOf('day')
    let index = 0
    for (const occurrence of ruleOccurrences(rule, first)) {
      if (rule.count !== null && index >= rule.count) break
      if (rule.until && occurrence > rule.until) break
      if (index === occurrenceIndex) return occurrence
      index++
    }
    return null
  }

  deleteTaskOccurrence(id: string, occurrenceIndex: number): boolean {
    const task = this.getTask(id)
    if (!task) throw new Error(`待办不存在: ${id}`)
    const occurrence = this.recurringTaskOccurrence(task, occurrenceIndex)
    if (!occurrence) throw new Error('重复任务实例不存在')
    const exdates = [...new Set([...(task.exdates ?? []), occurrence.toUTC().toISO()!])]
    this.db.prepare('UPDATE tasks SET exdates = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(exdates), nowIso(), id)
    return true
  }

  updateTaskOccurrence(id: string, occurrenceIndex: number, patch: UpdateTaskInput): Task {
    const task = this.getTask(id)
    if (!task) throw new Error(`待办不存在: ${id}`)
    const occurrence = this.recurringTaskOccurrence(task, occurrenceIndex)
    if (!occurrence) throw new Error('重复任务实例不存在')
    const standalone = this.createTask({
      parentId: task.parentId,
      title: patch.title ?? task.title,
      notes: patch.notes !== undefined ? patch.notes ?? undefined : task.notes ?? undefined,
      dueAt: patch.dueAt !== undefined ? patch.dueAt ?? undefined : occurrence.toISODate() ?? undefined,
      reminderMinutes: patch.reminderMinutes !== undefined ? patch.reminderMinutes : task.reminderMinutes,
      priority: patch.priority !== undefined ? patch.priority : task.priority,
      rrule: null
    })
    try {
      if (patch.completed !== undefined) this.updateTask(standalone.id, { completed: patch.completed })
      this.deleteTaskOccurrence(id, occurrenceIndex)
    } catch (error) {
      this.deleteTask(standalone.id)
      throw error
    }
    return this.getTask(standalone.id)!
  }

  listTrash(): TrashItem[] {
    return (this.db.prepare('SELECT id, kind, title, deleted_at FROM trash ORDER BY deleted_at DESC').all() as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      kind: row.kind as TrashItem['kind'],
      title: row.title as string,
      deletedAt: row.deleted_at as string
    }))
  }

  restoreTrash(id: string): boolean {
    const row = this.db.prepare('SELECT * FROM trash WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return false
    const payload = JSON.parse(row.payload as string) as Record<string, unknown>
    if (row.kind === 'event') {
      const calendarId = this.getCalendar(payload.calendar_id as string) ? payload.calendar_id : 'personal'
      this.db.prepare(
        `INSERT OR REPLACE INTO events (id, calendar_id, title, description, location, start_utc, end_utc, is_all_day, color_override, rrule, exdates, status, reminders, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(payload.id, calendarId, payload.title, payload.description ?? null, payload.location ?? null, payload.start_utc, payload.end_utc, payload.is_all_day ?? 0, payload.color_override ?? null, payload.rrule ?? null, payload.exdates ?? '[]', payload.status ?? 'confirmed', payload.reminders ?? '[]', payload.created_at, payload.updated_at)
    } else {
      const parentId = payload.parent_id && this.getTask(payload.parent_id as string) ? payload.parent_id : null
      this.db.prepare(
        `INSERT OR REPLACE INTO tasks (id, parent_id, title, notes, due_at, reminder_minutes, priority, sort_order, rrule, exdates, completed_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(payload.id, parentId, payload.title, payload.notes ?? null, payload.due_at ?? null, payload.reminder_minutes ?? null, payload.priority ?? 0, payload.sort_order ?? Date.now(), payload.rrule ?? null, payload.exdates ?? '[]', payload.completed_at ?? null, payload.status ?? 'needsAction', payload.created_at, payload.updated_at)
    }
    this.db.prepare('DELETE FROM trash WHERE id = ?').run(id)
    return true
  }

  deleteTrash(id: string): boolean {
    const row = this.db.prepare('SELECT * FROM trash WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return false
    const payload = JSON.parse(row.payload as string) as Record<string, unknown>
    const ownerKind = row.kind as 'event' | 'task'
    this.attachments.deleteForOwner(ownerKind, payload.id as string)
    return this.db.prepare('DELETE FROM trash WHERE id = ?').run(id).changes > 0
  }

  // ---------- attachments ----------

  listAttachments(ownerKind: Attachment['ownerKind'], ownerId: string): Attachment[] {
    return this.attachments.list(ownerKind, ownerId)
  }

  createAttachment(input: CreateAttachmentInput): Attachment {
    return this.attachments.create(input)
  }

  deleteAttachment(id: string): boolean {
    return this.attachments.delete(id)
  }

  getAttachmentContent(id: string): { attachment: Attachment; content: Buffer } | null {
    return this.attachments.getContent(id)
  }

  // ---------- agenda ----------

  getTodayAgenda(): { date: string; events: CalendarEvent[]; tasks: Task[] } {
    const today = DateTime.now().startOf('day')
    const events = this.listEvents(today.toISODate()!, today.toISODate()!)
    const tasks = this.listTaskOccurrences(today.toISODate()!, today.toISODate()!).filter((task) => task.status === 'needsAction')
    return { date: today.toISODate()!, events, tasks }
  }
}
