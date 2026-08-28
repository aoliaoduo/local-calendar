import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { DateTime } from 'luxon'
import { getRpcInfoPath, type RpcInfo } from '../shared/paths'
import { openDatabase } from '../shared/db'
import { CalendarService } from '../shared/service'
import { createMethodTable, type MethodTable } from '../shared/rpc-methods'
import type { Calendar, CalendarEvent, Task } from '../shared/types'

class CliError extends Error {}

const HELP = `本地日历 CLI — 操作 Local Calendar 的日程与待办

用法: localcal <命令> [参数]

日程:
  agenda                              今日总览（日程 + 待办）
  today                               agenda 的快捷别名
  next                                查看下一条即将开始的日程
  export [-f 开始] [-t 结束] [-o 文件] 导出 ICS 日程文件
  list [-f 开始] [-t 结束] [-c 日历]   查询日程（默认今天起 7 天）
  create <标题> -s <开始> [-e <结束>]  创建日程
       [-c 日历] [--all-day] [-l 地点] [-n 说明]
       [-r 重复] [--remind 分钟[,分钟...]]
       重复: daily|weekdays|weekly|monthly|yearly
  update <id> [--title 标题] [-s 开始] [-e 结束] [-c 日历] [-l 地点] [-n 说明]
       [-r 重复] [--remind 分钟[,分钟...]]
       -r none 改为不重复；--remind none 清除提醒
  delete <id>                         删除日程（id 可只写前几位；重复日程删除整个系列）
  search <关键词>                      搜索日程

待办:
  task list [--all | --done]          列出待办（默认未完成）
  task add <标题> [-d 截止日期] [-n 备注]
  task update <id> [--title 标题] [-d 截止日期] [-n 备注]
  task done <id>                      标记完成
  task undo <id>                      重新打开
  task delete <id>                    删除待办

其他:
  calendars                           列出日历
  help                                显示本帮助

通用:
  --json                              以 JSON 输出（便于程序与 AI 解析）

时间格式: ISO 8601（本地时区），如 2026-08-28T14:00；纯日期 2026-08-28 视为全天。
日历 ID: personal(个人) work(工作) family(家庭) holidays(中国节假日, 只读)

应用运行时改动实时同步到界面；未运行时直接读写本地数据库。`

// ---------- 后端：优先本地 RPC（应用运行中），否则直接读写数据库 ----------

class Backend {
  private rpc: RpcInfo | null | undefined
  private table: MethodTable | null = null

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const viaApp = await this.tryApp<T>(method, params)
    if (viaApp !== undefined) return viaApp
    return this.callOffline<T>(method, params)
  }

  private async tryApp<T>(method: string, params: Record<string, unknown>): Promise<T | undefined> {
    if (this.rpc === undefined) this.rpc = probeApp()
    if (!this.rpc) return undefined
    try {
      const res = await fetch(`http://127.0.0.1:${this.rpc.port}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.rpc.token}` },
        body: JSON.stringify({ method, params }),
        signal: AbortSignal.timeout(3000)
      })
      const json = (await res.json()) as { ok: boolean; data?: T; error?: string }
      if (!json.ok) throw new CliError(json.error || '调用失败')
      return json.data as T
    } catch (err) {
      if (err instanceof CliError) throw err
      this.rpc = null
      return undefined
    }
  }

  private callOffline<T>(method: string, params: Record<string, unknown>): T {
    if (!this.table) this.table = createMethodTable(new CalendarService(openDatabase()))
    const fn = this.table.methods.get(method)
    if (!fn) throw new CliError(`未知方法: ${method}`)
    return fn(params) as T
  }
}

function probeApp(): RpcInfo | null {
  const path = getRpcInfoPath()
  if (!existsSync(path)) return null
  try {
    const info = JSON.parse(readFileSync(path, 'utf-8')) as RpcInfo
    return info?.port && info?.token ? info : null
  } catch {
    return null
  }
}

// ---------- 参数解析 ----------

const SHORT_TO_LONG: Record<string, string> = {
  s: 'start',
  e: 'end',
  c: 'calendar',
  l: 'location',
  n: 'note',
  d: 'due',
  f: 'from',
  t: 'to',
  r: 'repeat',
  o: 'out'
}
const VALUE_FLAGS = new Set(['start', 'end', 'calendar', 'location', 'note', 'due', 'from', 'to', 'title', 'repeat', 'remind', 'out'])
const BOOL_FLAGS = new Set(['all-day', 'all', 'done', 'json'])

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

interface ParsedArgs {
  flags: Record<string, string | true>
  positional: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | true> = {}
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      if (BOOL_FLAGS.has(key)) flags[key] = true
      else if (VALUE_FLAGS.has(key)) flags[key] = argv[++i] ?? ''
      else throw new CliError(`未知选项: ${a}（localcal help 查看用法）`)
    } else if (a.startsWith('-') && a.length === 2) {
      const key = SHORT_TO_LONG[a.slice(1)]
      if (!key) throw new CliError(`未知选项: ${a}（localcal help 查看用法）`)
      flags[key] = argv[++i] ?? ''
    } else {
      positional.push(a)
    }
  }
  return { flags, positional }
}

// ---------- 输出格式 ----------

function str(flags: Record<string, string | true>, key: string): string | undefined {
  const v = flags[key]
  return typeof v === 'string' && v ? v : undefined
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

const WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function fmtEventLine(e: CalendarEvent, calName?: string): string {
  const s = DateTime.fromISO(e.startUtc).toLocal()
  const en = DateTime.fromISO(e.endUtc).toLocal()
  const when = e.isAllDay
    ? `${s.toFormat('yyyy-MM-dd')} 全天`
    : s.hasSame(en, 'day')
      ? `${s.toFormat('yyyy-MM-dd')} ${s.toFormat('HH:mm')}–${en.toFormat('HH:mm')}`
      : `${s.toFormat('yyyy-MM-dd HH:mm')} – ${en.toFormat('yyyy-MM-dd HH:mm')}`
  const segs = [when, `${e.rrule ? '↻ ' : ''}${e.title}`]
  if (e.location) segs.push(`@ ${e.location}`)
  if (calName) segs.push(`[${calName}]`)
  segs.push(`id:${shortId(e.id)}`)
  return segs.join('  ')
}

function fmtTaskLine(t: Task): string {
  const mark = t.status === 'completed' ? '[x]' : '[ ]'
  const due = t.dueAt ? ` 截止 ${DateTime.fromISO(t.dueAt).toLocal().toFormat('yyyy-MM-dd')}` : ''
  return `${mark} ${t.title}${due}  id:${shortId(t.id)}`
}

async function calNames(backend: Backend): Promise<Map<string, string>> {
  const cals = await backend.call<Calendar[]>('calendars.list')
  return new Map(cals.map((c) => [c.id, c.name]))
}

// ---------- ID 前缀解析 ----------

async function resolveEvent(backend: Backend, prefix: string | undefined): Promise<CalendarEvent> {
  if (!prefix) throw new CliError('缺少日程 ID（先用 list 查看日程）')
  if (prefix.startsWith('holiday-')) throw new CliError('中国节假日为内置只读日历，无法修改')
  const base = prefix.split('#')[0]
  const all = await backend.call<CalendarEvent[]>('events.list', {})
  const matches = all.filter((e) => e.id === base || e.id.startsWith(base))
  if (matches.length === 0) throw new CliError(`未找到 ID 以 "${prefix}" 开头的日程`)
  if (matches.length > 1) throw new CliError(`ID 前缀 "${prefix}" 匹配到 ${matches.length} 个日程，请提供更长前缀`)
  return matches[0]
}

async function resolveTask(backend: Backend, prefix: string | undefined): Promise<Task> {
  if (!prefix) throw new CliError('缺少待办 ID（先用 task list 查看）')
  const all = await backend.call<Task[]>('tasks.list', { filter: { status: 'all' } })
  const matches = all.filter((t) => t.id === prefix || t.id.startsWith(prefix))
  if (matches.length === 0) throw new CliError(`未找到 ID 以 "${prefix}" 开头的待办`)
  if (matches.length > 1) throw new CliError(`ID 前缀 "${prefix}" 匹配到 ${matches.length} 个待办，请提供更长前缀`)
  return matches[0]
}

async function assertWritableCalendar(backend: Backend, id: string): Promise<void> {
  if (id === 'holidays') throw new CliError('中国节假日为只读日历，不能写入')
  const cals = await backend.call<Calendar[]>('calendars.list')
  if (!cals.some((c) => c.id === id)) {
    throw new CliError(`日历 "${id}" 不存在。可用: ${cals.map((c) => `${c.id}(${c.name})`).join(' ')}`)
  }
}

// ---------- 命令实现 ----------

function emitJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

async function cmdAgenda(backend: Backend, json: boolean): Promise<void> {
  const data = await backend.call<{ date: string; events: CalendarEvent[]; tasks: Task[] }>('agenda.today')
  if (json) return emitJson(data)
  const names = await calNames(backend)
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
  const names = await calNames(backend)
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
  const names = await calNames(backend)
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
  const names = await calNames(backend)
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
  const names = await calNames(backend)
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
  const names = await calNames(backend)
  console.log(`"${query}" 的搜索结果 (${events.length}):`)
  if (!events.length) console.log('  （无）')
  for (const e of events) console.log(`  ${fmtEventLine(e, names.get(e.calendarId))}`)
}

async function cmdTaskList(backend: Backend, flags: Record<string, string | true>, json: boolean): Promise<void> {
  const status = flags.done === true ? 'completed' : flags.all === true ? 'all' : 'needsAction'
  const tasks = await backend.call<Task[]>('tasks.list', { filter: { status } })
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
    title,
    notes: str(flags, 'note'),
    dueAt: str(flags, 'due')
  })
  if (json) return emitJson(task)
  console.log(`已创建待办 → ${fmtTaskLine(task)}`)
}

async function cmdTaskDone(
  backend: Backend,
  idPrefix: string | undefined,
  completed: boolean,
  json: boolean
): Promise<void> {
  const target = await resolveTask(backend, idPrefix)
  const task = await backend.call<Task>('tasks.update', { id: target.id, patch: { completed } })
  if (json) return emitJson(task)
  console.log(completed ? `已完成: ${task.title}` : `已重新打开: ${task.title}`)
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
  if (!Object.keys(patch).length) throw new CliError('没有要修改的字段（--title / -d / -n）')
  const task = await backend.call<Task>('tasks.update', { id: target.id, patch })
  if (json) return emitJson(task)
  console.log(`已更新待办 → ${fmtTaskLine(task)}`)
}

async function cmdTaskDelete(backend: Backend, idPrefix: string | undefined, json: boolean): Promise<void> {
  const target = await resolveTask(backend, idPrefix)
  const ok = await backend.call<boolean>('tasks.delete', { id: target.id })
  if (json) return emitJson({ ok, id: target.id })
  console.log(ok ? `已删除待办「${target.title}」` : `删除失败: ${target.id}`)
}

async function cmdCalendars(backend: Backend, json: boolean): Promise<void> {
  const cals = await backend.call<Calendar[]>('calendars.list')
  if (json) return emitJson(cals)
  for (const c of cals) {
    console.log(`${c.id.padEnd(10)} ${c.name.padEnd(8)} ${c.color}  ${c.isVisible ? '可见' : '隐藏'}${c.id === 'holidays' ? '（只读）' : ''}`)
  }
}

// ---------- 入口 ----------

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (!argv.length) {
    console.log(HELP)
    process.exitCode = 1
    return
  }
  const { flags, positional } = parseArgs(argv)
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
    case 'task': {
      const [sub, ...subRest] = rest
      switch (sub) {
        case 'list':
          return cmdTaskList(backend, flags, json)
        case 'add':
          return cmdTaskAdd(backend, flags, subRest, json)
        case 'done':
          return cmdTaskDone(backend, subRest[0], true, json)
        case 'undo':
          return cmdTaskDone(backend, subRest[0], false, json)
        case 'update':
          return cmdTaskUpdate(backend, flags, subRest[0], json)
        case 'delete':
          return cmdTaskDelete(backend, subRest[0], json)
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
