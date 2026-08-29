import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, resolve } from 'node:path'
import { DateTime } from 'luxon'
import { getDataDir, getDbPath } from '../shared/paths'
import { parseIcsEvents } from '../shared/ics'
import type { Attachment, Calendar, CalendarEvent, Task, TrashItem } from '../shared/types'
import { Backend, isAppRunning } from './backend'
import { parseArgs, str } from './args'
import { CliError } from './errors'
import { HELP } from './help'
import { calendarNames, emitJson, fmtEventLine, fmtTaskLine, resolveEvent, resolveTask, assertWritableCalendar, shortId, WEEKDAY_CN } from './command-utils'

const cliDataDir = readCliDataDir(process.argv.slice(2))
if (cliDataDir) process.env.LOCAL_CALENDAR_DATA_DIR = resolve(cliDataDir)

if (!process.env.LOCAL_CALENDAR_PACKAGE_DIR && process.argv[1]) {
  process.env.LOCAL_CALENDAR_PACKAGE_DIR = dirname(dirname(dirname(process.argv[1])))
  process.env.LOCAL_CALENDAR_CLI_LOCAL = '1'
}

function readCliDataDir(argv: string[]): string | undefined {
  const index = argv.indexOf('--data-dir')
  if (index < 0) return undefined
  const value = argv[index + 1]
  return value && !value.startsWith('-') ? value : undefined
}

const REPEAT_MAP: Record<string, string> = {
  daily: 'DAILY',
  weekdays: 'WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
  none: ''
}

function repeatRrule(value: string): string | null {
  const key = value.trim().toLowerCase()
  if (key in REPEAT_MAP) return REPEAT_MAP[key] || null
  return value
}

function parseReminders(value: string | undefined): { minutes: number; method: 'popup' }[] | undefined {
  if (value === undefined) return undefined
  if (value.trim().toLowerCase() === 'none' || value.trim() === '') return []
  const values = value.split(',').map((part) => Number(part.trim()))
  if (values.some((minutes) => !Number.isInteger(minutes) || minutes < 0 || minutes > 10080)) {
    throw new CliError('提醒分钟数必须是 0–10080 的整数（可用逗号分隔多个值）')
  }
  return [...new Set(values)].map((minutes) => ({ minutes, method: 'popup' as const }))
}

function parseTaskReminder(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined
  if (value.trim().toLowerCase() === 'none' || value.trim() === '') return null
  const minutes = Number(value)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) throw new CliError('任务提醒分钟数必须是 0–10080 的整数')
  return minutes
}

function parseTaskPriority(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const key = value.trim().toLowerCase()
  if (key === 'high' || key === '高' || key === '1') return 1
  if (key === 'low' || key === '低' || key === '-1') return -1
  if (key === 'normal' || key === '普通' || key === '0') return 0
  throw new CliError('任务优先级可用 high、normal、low（或 1、0、-1）')
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsDate(value: string): string {
  return DateTime.fromISO(value).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
}

async function cmdExport(backend: Backend, flags: Record<string, string | true>, json: boolean): Promise<void> {
  const from = str(flags, 'from') ?? DateTime.now().minus({ days: 30 }).toFormat('yyyy-MM-dd')
  const to = str(flags, 'to') ?? DateTime.now().plus({ days: 365 }).toFormat('yyyy-MM-dd')
  const output = str(flags, 'out')
  if (!output) throw new CliError('缺少输出文件。用法: export -o calendar.ics')
  const events = await backend.call<CalendarEvent[]>('events.list', { from, to })
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Local Calendar//EN', 'CALSCALE:GREGORIAN']
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.id}@local-calendar`, `DTSTAMP:${icsDate(event.createdAt)}`)
    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${DateTime.fromISO(event.startUtc).toLocal().toFormat('yyyyMMdd')}`)
      lines.push(`DTEND;VALUE=DATE:${DateTime.fromISO(event.endUtc).toLocal().plus({ days: 1 }).toFormat('yyyyMMdd')}`)
    } else {
      lines.push(`DTSTART:${icsDate(event.startUtc)}`, `DTEND:${icsDate(event.endUtc)}`)
    }
    lines.push(`SUMMARY:${icsEscape(event.title)}`)
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`)
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`)
    if (event.rrule) lines.push(`RRULE:${event.rrule}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  writeFileSync(output, `${lines.join('\r\n')}\r\n`, 'utf8')
  if (json) return emitJson({ path: output, count: events.length, from, to })
  console.log(`已导出 ${events.length} 条日程 → ${output}`)
}

async function cmdImport(backend: Backend, flags: Record<string, string | true>, json: boolean): Promise<void> {
  const input = str(flags, 'in')
  if (!input) throw new CliError('缺少输入文件。用法: import -i calendar.ics')
  let content: string
  try {
    content = readFileSync(input, 'utf8')
  } catch {
    throw new CliError(`无法读取 ICS 文件: ${input}`)
  }
  const imported: CalendarEvent[] = []
  for (const inputEvent of parseIcsEvents(content)) {
    imported.push(await backend.call<CalendarEvent>('events.create', { ...inputEvent }))
  }
  if (json) return emitJson({ count: imported.length, events: imported })
  console.log(`已导入 ${imported.length} 条日程`)
}

// ---------- 命令实现 ----------

async function cmdAgenda(backend: Backend, json: boolean): Promise<void> {
  const data = await backend.call<{ date: string; events: CalendarEvent[]; tasks: Task[] }>('agenda.today')
  if (json) return emitJson(data)
  const names = await calendarNames(backend)
  const d = DateTime.fromISO(data.date)
  const lines = [`今天 ${data.date}（${WEEKDAY_CN[d.weekday - 1]}）`, '', `日程 (${data.events.length}):`]
  if (!data.events.length) lines.push('  （无）')
  for (const e of data.events) {
    const s = DateTime.fromISO(e.startUtc).toLocal()
    const en = DateTime.fromISO(e.endUtc).toLocal()
    const when = e.isAllDay
      ? '全天'
      : s.hasSame(en, 'day')
        ? `${s.toFormat('HH:mm')}–${en.toFormat('HH:mm')}`
        : `${s.toFormat('MM-dd HH:mm')}–${en.toFormat('MM-dd HH:mm')}`
    const loc = e.location ? ` @ ${e.location}` : ''
    lines.push(`  ${when}  ${e.title}${loc}  [${names.get(e.calendarId) ?? e.calendarId}]`)
  }
  lines.push('', `待办 (${data.tasks.length} 未完成):`)
  if (!data.tasks.length) lines.push('  （无）')
  for (const t of data.tasks) lines.push(`  ${fmtTaskLine(t)}`)
  console.log(lines.join('\n'))
}

async function cmdNext(backend: Backend, json: boolean): Promise<void> {
  const now = DateTime.now()
  const events = await backend.call<CalendarEvent[]>('events.list', {
    from: now.toISO(),
    to: now.plus({ days: 30 }).toISO()
  })
  const next = events
    .filter((event) => DateTime.fromISO(event.startUtc).toMillis() > now.toMillis())
    .sort((first, second) => first.startUtc.localeCompare(second.startUtc))[0] ?? null
  if (json) return emitJson(next)
  if (!next) {
    console.log('未来 30 天没有即将开始的日程')
    return
  }
  const names = await calendarNames(backend)
  console.log(fmtEventLine(next, names.get(next.calendarId)))
}

async function cmdList(backend: Backend, flags: Record<string, string | true>, json: boolean): Promise<void> {
  const from = str(flags, 'from') ?? DateTime.now().toFormat('yyyy-MM-dd')
  const to = str(flags, 'to') ?? DateTime.now().plus({ days: 7 }).toFormat('yyyy-MM-dd')
  const events = await backend.call<CalendarEvent[]>('events.list', {
    from,
    to,
    calendarId: str(flags, 'calendar')
  })
  if (json) return emitJson(events)
  const names = await calendarNames(backend)
  console.log(`日程 ${from} ~ ${to} (${events.length}):`)
  if (!events.length) console.log('  （无）')
  for (const e of events) console.log(`  ${fmtEventLine(e, names.get(e.calendarId))}`)
}

async function cmdCreate(
  backend: Backend,
  flags: Record<string, string | true>,
  titleParts: string[],
  json: boolean
): Promise<void> {
  const title = titleParts.join(' ').trim()
  if (!title) throw new CliError('缺少标题。用法: create <标题> -s <开始时间>')
  const start = str(flags, 'start')
  if (!start) throw new CliError('缺少开始时间。用法: create <标题> -s 2026-08-28T14:00')
  const calendarId = str(flags, 'calendar')
  if (calendarId) await assertWritableCalendar(backend, calendarId)
  const repeat = str(flags, 'repeat')
  const evt = await backend.call<CalendarEvent>('events.create', {
    title,
    start,
    end: str(flags, 'end'),
    calendarId,
    location: str(flags, 'location'),
    description: str(flags, 'note'),
    isAllDay: flags['all-day'] === true || undefined,
    rrule: repeat ? repeatRrule(repeat) : undefined,
    reminders: parseReminders(str(flags, 'remind'))
  })
  if (json) return emitJson(evt)
  const names = await calendarNames(backend)
  console.log(`已创建 → ${fmtEventLine(evt, names.get(evt.calendarId))}`)
}

async function cmdUpdate(
  backend: Backend,
  flags: Record<string, string | true>,
  idPrefix: string | undefined,
  json: boolean
): Promise<void> {
  const target = await resolveEvent(backend, idPrefix)
  const patch: Record<string, unknown> = {}
  if (str(flags, 'title')) patch.title = str(flags, 'title')
  if (str(flags, 'start')) patch.start = str(flags, 'start')
  if (str(flags, 'end')) patch.end = str(flags, 'end')
  if (str(flags, 'location')) patch.location = str(flags, 'location')
  if (str(flags, 'note')) patch.description = str(flags, 'note')
  if (str(flags, 'calendar')) {
    await assertWritableCalendar(backend, str(flags, 'calendar')!)
    patch.calendarId = str(flags, 'calendar')
  }
  if (flags['all-day'] === true) patch.isAllDay = true
  if (str(flags, 'repeat')) patch.rrule = repeatRrule(str(flags, 'repeat')!)
  if (flags.remind !== undefined) patch.reminders = parseReminders(typeof flags.remind === 'string' ? flags.remind : undefined)
  if (!Object.keys(patch).length) throw new CliError('没有要修改的字段（--title / -s / -e / -c / -l / -n / -r / --remind / --all-day）')
  const evt = await backend.call<CalendarEvent>('events.update', { id: target.id, patch })
  if (json) return emitJson(evt)
  const names = await calendarNames(backend)
  console.log(`已更新 → ${fmtEventLine(evt, names.get(evt.calendarId))}`)
}

async function cmdDelete(backend: Backend, idPrefix: string | undefined, json: boolean): Promise<void> {
  const target = await resolveEvent(backend, idPrefix)
  const ok = await backend.call<boolean>('events.delete', { id: target.id })
  if (json) return emitJson({ ok, id: target.id })
  console.log(ok ? `已删除日程「${target.title}」` : `删除失败: ${target.id}`)
}

async function cmdSearch(backend: Backend, queryParts: string[], json: boolean): Promise<void> {
  const query = queryParts.join(' ').trim()
  if (!query) throw new CliError('缺少关键词。用法: search <关键词>')
  const events = await backend.call<CalendarEvent[]>('events.search', { query })
  if (json) return emitJson(events)
  const names = await calendarNames(backend)
  console.log(`"${query}" 的搜索结果 (${events.length}):`)
  if (!events.length) console.log('  （无）')
  for (const e of events) console.log(`  ${fmtEventLine(e, names.get(e.calendarId))}`)
}

async function cmdTaskList(backend: Backend, flags: Record<string, string | true>, json: boolean): Promise<void> {
  const status = flags.done === true ? 'completed' : flags.all === true ? 'all' : 'needsAction'
  let tasks = await backend.call<Task[]>('tasks.list', { filter: { status } })
  const today = DateTime.now().toISODate()!
  if (flags.today === true || flags.overdue === true || flags.scheduled === true) {
    tasks = tasks.filter((task) => {
      if (!task.dueAt) return flags.scheduled !== true
      const date = DateTime.fromISO(task.dueAt).toLocal().toISODate()!
      if (flags.today === true) return date === today
      if (flags.overdue === true) return date < today
      return true
    })
  }
  if (json) return emitJson(tasks)
  const label = status === 'completed' ? '已完成待办' : status === 'all' ? '全部待办' : '未完成待办'
  console.log(`${label} (${tasks.length}):`)
  if (!tasks.length) console.log('  （无）')
  for (const t of tasks) {
    console.log(`  ${fmtTaskLine(t)}`)
    if (t.notes) console.log(`      备注: ${t.notes}`)
  }
}

async function cmdTaskAdd(
  backend: Backend,
  flags: Record<string, string | true>,
  titleParts: string[],
  json: boolean
): Promise<void> {
  const title = titleParts.join(' ').trim()
  if (!title) throw new CliError('缺少标题。用法: task add <标题> [-d 截止日期]')
  const task = await backend.call<Task>('tasks.create', {
    parentId: str(flags, 'parent') ? (await resolveTask(backend, str(flags, 'parent'))).id : undefined,
    title,
    notes: str(flags, 'note'),
    dueAt: str(flags, 'due'),
    reminderMinutes: parseTaskReminder(str(flags, 'remind')),
    priority: parseTaskPriority(str(flags, 'priority')),
    rrule: str(flags, 'repeat') ? repeatRrule(str(flags, 'repeat')!) : undefined
  })
  if (json) return emitJson(task)
  console.log(`已创建待办 → ${fmtTaskLine(task)}`)
}

async function cmdTaskDone(
  backend: Backend,
  idPrefixes: string[],
  completed: boolean,
  json: boolean
): Promise<void> {
  if (!idPrefixes.length) throw new CliError('缺少待办 ID（先用 task list 查看）')
  const tasks: Task[] = []
  for (const prefix of idPrefixes) {
    const target = await resolveTask(backend, prefix)
    tasks.push(await backend.call<Task>('tasks.update', { id: target.id, patch: { completed } }))
  }
  if (json) return emitJson(tasks)
  for (const task of tasks) console.log(completed ? `已完成: ${task.title}` : `已重新打开: ${task.title}`)
}

async function cmdTaskDoneAll(backend: Backend, flags: Record<string, string | true>, json: boolean): Promise<void> {
  if (flags.today !== true && flags.overdue !== true) throw new CliError('批量完成必须指定 --today 或 --overdue')
  const today = DateTime.now().toISODate()!
  const all = await backend.call<Task[]>('tasks.list', { filter: { status: 'needsAction' } })
  const targets = all.filter((task) => {
    if (!task.dueAt) return false
    const date = DateTime.fromISO(task.dueAt).toLocal().toISODate()!
    return flags.today === true ? date === today : date < today
  })
  const completed: Task[] = []
  for (const task of targets) completed.push(await backend.call<Task>('tasks.update', { id: task.id, patch: { completed: true } }))
  if (json) return emitJson(completed)
  console.log(completed.length ? `已完成 ${completed.length} 个任务` : '没有符合条件的任务')
}

async function cmdTaskUpdate(
  backend: Backend,
  flags: Record<string, string | true>,
  idPrefix: string | undefined,
  json: boolean
): Promise<void> {
  const target = await resolveTask(backend, idPrefix)
  const patch: Record<string, unknown> = {}
  if (str(flags, 'title')) patch.title = str(flags, 'title')
  if (flags.due !== undefined) patch.dueAt = str(flags, 'due') ?? null
  if (flags.note !== undefined) patch.notes = str(flags, 'note') ?? null
  if (flags.remind !== undefined) patch.reminderMinutes = parseTaskReminder(str(flags, 'remind'))
  if (flags.priority !== undefined) patch.priority = parseTaskPriority(str(flags, 'priority'))
  if (flags.repeat !== undefined) patch.rrule = str(flags, 'repeat') === 'none' ? null : repeatRrule(str(flags, 'repeat')!)
  if (flags.parent !== undefined) patch.parentId = str(flags, 'parent') === 'none' ? null : (await resolveTask(backend, str(flags, 'parent'))).id
  if (!Object.keys(patch).length) throw new CliError('没有要修改的字段（--title / -d / -n / -p / -r / --remind / --parent）')
  const task = await backend.call<Task>('tasks.update', { id: target.id, patch })
  if (json) return emitJson(task)
  console.log(`已更新待办 → ${fmtTaskLine(task)}`)
}

async function cmdTaskDelete(backend: Backend, idPrefixes: string[], json: boolean): Promise<void> {
  if (!idPrefixes.length) throw new CliError('缺少待办 ID（先用 task list 查看）')
  const results: { ok: boolean; id: string; title: string }[] = []
  for (const prefix of idPrefixes) {
    const target = await resolveTask(backend, prefix)
    const ok = await backend.call<boolean>('tasks.delete', { id: target.id })
    results.push({ ok, id: target.id, title: target.title })
  }
  if (json) return emitJson(results)
  for (const result of results) console.log(result.ok ? `已删除待办「${result.title}」` : `删除失败: ${result.id}`)
}

async function cmdCalendars(backend: Backend, json: boolean): Promise<void> {
  const cals = await backend.call<Calendar[]>('calendars.list')
  if (json) return emitJson(cals)
  for (const c of cals) {
    console.log(`${c.id.padEnd(10)} ${c.name.padEnd(8)} ${c.color}  ${c.isVisible ? '可见' : '隐藏'}${c.id === 'holidays' ? '（只读）' : ''}`)
  }
}

async function cmdCalendar(backend: Backend, flags: Record<string, string | true>, args: string[], json: boolean): Promise<void> {
  const [action, id] = args
  if (action === 'list') return cmdCalendars(backend, json)
  if (action === 'create') {
    const name = args.slice(1).join(' ').trim()
    if (!name) throw new CliError('缺少日历名称。用法: calendar create <名称> [--color 色值]')
    const calendar = await backend.call<Calendar>('calendars.create', { name, color: str(flags, 'color') })
    if (json) return emitJson(calendar)
    console.log(`已创建日历 → ${calendar.name}  id:${shortId(calendar.id)}`)
    return
  }
  if (action === 'update') {
    const target = (await calendarNames(backend)).has(id ?? '') ? id! : undefined
    if (!target) throw new CliError('缺少或不存在的日历 ID（先用 calendars 查看）')
    const patch: Record<string, unknown> = {}
    if (str(flags, 'title')) patch.name = str(flags, 'title')
    if (str(flags, 'color')) patch.color = str(flags, 'color')
    if (!Object.keys(patch).length) throw new CliError('没有要修改的字段（--title / --color）')
    const calendar = await backend.call<Calendar>('calendars.update', { id: target, patch })
    if (json) return emitJson(calendar)
    console.log(`已更新日历 → ${calendar?.name ?? target}`)
    return
  }
  if (action === 'delete') {
    if (!id) throw new CliError('缺少日历 ID（先用 calendars 查看）')
    const ok = await backend.call<boolean>('calendars.delete', { id })
    if (json) return emitJson({ ok, id })
    console.log(ok ? `已删除日历 ${id}` : `未找到日历 ${id}`)
    return
  }
  throw new CliError('日历用法: calendar list|create|update|delete')
}

function attachmentMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.txt' || ext === '.md') return 'text/plain'
  return 'application/octet-stream'
}

async function attachmentOwner(backend: Backend, kind: string | undefined, id: string | undefined): Promise<{ kind: 'event' | 'task'; id: string }> {
  if (kind === 'event') return { kind, id: (await resolveEvent(backend, id)).id }
  if (kind === 'task') return { kind, id: (await resolveTask(backend, id)).id }
  throw new CliError('附件类型必须是 event 或 task')
}

async function cmdAttachment(backend: Backend, flags: Record<string, string | true>, args: string[], json: boolean): Promise<void> {
  const [action, kind, ownerPrefix, attachmentPrefix] = args
  if (!['list', 'add', 'delete'].includes(action ?? '')) throw new CliError('附件用法: attachment list|add|delete <event|task> <对象ID>')
  const owner = await attachmentOwner(backend, kind, ownerPrefix)
  const attachments = await backend.call<Attachment[]>('attachments.list', { ownerKind: owner.kind, ownerId: owner.id })
  if (action === 'list') {
    if (json) return emitJson(attachments)
    for (const attachment of attachments) console.log(`${attachment.name}  ${attachment.size} B  id:${shortId(attachment.id)}`)
    return
  }
  if (action === 'add') {
    const input = str(flags, 'in')
    if (!input) throw new CliError('缺少文件。用法: attachment add <event|task> <对象ID> -i 文件')
    let content: Buffer
    try {
      content = readFileSync(input)
    } catch {
      throw new CliError(`无法读取附件文件: ${input}`)
    }
    const attachment = await backend.call<Attachment>('attachments.create', { ownerKind: owner.kind, ownerId: owner.id, name: basename(input), mimeType: attachmentMimeType(input), contentBase64: content.toString('base64') })
    if (json) return emitJson(attachment)
    console.log(`已添加附件 → ${attachment.name}  id:${shortId(attachment.id)}`)
    return
  }
  if (!attachmentPrefix) throw new CliError('缺少附件 ID（先用 attachment list 查看）')
  const matches = attachments.filter((attachment) => attachment.id === attachmentPrefix || attachment.id.startsWith(attachmentPrefix))
  if (matches.length !== 1) throw new CliError(matches.length ? `附件 ID 前缀 "${attachmentPrefix}" 不唯一` : '附件不存在')
  const ok = await backend.call<boolean>('attachments.delete', { id: matches[0].id })
  if (json) return emitJson({ ok, id: matches[0].id })
  console.log(ok ? `已删除附件 ${matches[0].name}` : '删除附件失败')
}

async function cmdTrash(backend: Backend, args: string[], json: boolean): Promise<void> {
  const [action, prefix] = args
  const items = await backend.call<TrashItem[]>('trash.list')
  if (action === 'list') {
    if (json) return emitJson(items)
    for (const item of items) console.log(`${item.kind === 'event' ? '日程' : '任务'}  ${item.title}  id:${shortId(item.id)}`)
    return
  }
  if (!['restore', 'delete'].includes(action ?? '') || !prefix) throw new CliError('回收站用法: trash list|restore <ID>|delete <ID>')
  const matches = items.filter((item) => item.id === prefix || item.id.startsWith(prefix))
  if (matches.length !== 1) throw new CliError(matches.length ? `回收站 ID 前缀 "${prefix}" 不唯一` : '回收站项目不存在')
  const method = action === 'restore' ? 'trash.restore' : 'trash.delete'
  const ok = await backend.call<boolean>(method, { id: matches[0].id })
  if (json) return emitJson({ ok, id: matches[0].id })
  console.log(ok ? (action === 'restore' ? '已恢复回收站项目' : '已永久删除回收站项目') : '操作失败')
}

async function cmdDoctor(backend: Backend, json: boolean): Promise<void> {
  const calendars = await backend.call<Calendar[]>('calendars.list')
  const tasks = await backend.call<Task[]>('tasks.list', { filter: { status: 'all' } })
  const events = await backend.call<CalendarEvent[]>('events.list', {})
  const report = {
    dataDir: getDataDir(),
    dataSource: cliDataDir ? '--data-dir' : process.env.LOCAL_CALENDAR_DATA_DIR ? 'LOCAL_CALENDAR_DATA_DIR' : process.env.LOCAL_CALENDAR_PACKAGE_DIR ? '命令所在包目录' : '当前工作目录',
    database: getDbPath(),
    databaseExists: existsSync(getDbPath()),
    appRunning: isAppRunning(),
    calendars: calendars.length,
    events: events.length,
    tasks: tasks.length
  }
  if (json) return emitJson(report)
  console.log(`数据目录: ${report.dataDir}`)
  console.log(`数据库: ${report.database}（${report.databaseExists ? '存在' : '不存在'}）`)
  console.log(`应用连接: ${report.appRunning ? '运行中（RPC）' : '未运行（离线模式）'}`)
  console.log(`日历 ${report.calendars} · 日程 ${report.events} · 任务 ${report.tasks}`)
}

// ---------- 入口 ----------

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (!argv.length) {
    console.log(HELP)
    return
  }
  const { flags, positional } = parseArgs(argv)
  if (flags['data-dir'] !== undefined && !str(flags, 'data-dir')) throw new CliError('--data-dir 需要提供数据目录路径')
  if (flags.help === true) {
    console.log(HELP)
    return
  }
  const json = flags.json === true
  const [cmd, ...rest] = positional
  const backend = new Backend()

  switch (cmd) {
    case 'help':
      console.log(HELP)
      return
    case 'agenda':
      return cmdAgenda(backend, json)
    case 'today':
      return cmdAgenda(backend, json)
    case 'next':
      return cmdNext(backend, json)
    case 'export':
      return cmdExport(backend, flags, json)
    case 'import':
      return cmdImport(backend, flags, json)
    case 'list':
      return cmdList(backend, flags, json)
    case 'create':
      return cmdCreate(backend, flags, rest, json)
    case 'update':
      return cmdUpdate(backend, flags, rest[0], json)
    case 'delete':
      return cmdDelete(backend, rest[0], json)
    case 'search':
      return cmdSearch(backend, rest, json)
    case 'calendars':
      return cmdCalendars(backend, json)
    case 'calendar':
      return cmdCalendar(backend, flags, rest, json)
    case 'attachment':
      return cmdAttachment(backend, flags, rest, json)
    case 'trash':
      return cmdTrash(backend, rest, json)
    case 'doctor':
      return cmdDoctor(backend, json)
    case 'task': {
      const [sub, ...subRest] = rest
      switch (sub) {
        case 'list':
          return cmdTaskList(backend, flags, json)
        case 'add':
          return cmdTaskAdd(backend, flags, subRest, json)
        case 'done':
          return cmdTaskDone(backend, subRest, true, json)
        case 'done-all':
          return cmdTaskDoneAll(backend, flags, json)
        case 'undo':
          return cmdTaskDone(backend, subRest, false, json)
        case 'update':
          return cmdTaskUpdate(backend, flags, subRest[0], json)
        case 'delete':
          return cmdTaskDelete(backend, subRest, json)
        default:
          throw new CliError(`未知子命令: task ${sub ?? ''}。用法: task list|add|done|undo|delete`)
      }
    }
    default:
      console.error(`未知命令: ${cmd}`)
      console.error(HELP)
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  const json = process.argv.includes('--json')
  if (json) console.error(JSON.stringify({ ok: false, error: message }))
  else console.error(`错误: ${message}`)
  process.exit(1)
})
