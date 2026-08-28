import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, Tray, Notification } from 'electron'
import { dirname, join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import { openDatabase } from '../shared/db'
import { CalendarService } from '../shared/service'
import { createMethodTable } from '../shared/rpc-methods'
import { getDbPath, getRpcInfoPath, getDataDir } from '../shared/paths'
import type { Task } from '../shared/types'
import { isReminderDue } from '../shared/reminders'
import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, unlinkSync } from 'node:fs'

const windowStatePath = () => join(getDataDir(), 'window-state.json')
const preferencesPath = () => join(getDataDir(), 'preferences.json')
interface NotificationPreferences { notificationsEnabled: boolean }
function readNotificationPreferences(): NotificationPreferences {
  try {
    const value = JSON.parse(readFileSync(preferencesPath(), 'utf8')) as Partial<NotificationPreferences>
    return { notificationsEnabled: value.notificationsEnabled !== false }
  } catch {
    return { notificationsEnabled: true }
  }
}
interface WindowState { x?: number; y?: number; width?: number; height?: number; maximized?: boolean }
function readWindowState(): WindowState {
  try { return JSON.parse(readFileSync(windowStatePath(), 'utf8')) as WindowState } catch { return {} }
}
function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.isMaximized() ? undefined : win.getBounds()
    const previous = readWindowState()
    writeFileSync(windowStatePath(), JSON.stringify({ ...previous, ...(bounds ?? {}), maximized: win.isMaximized() }, null, 2))
  } catch { /* 状态保存失败不影响应用 */ }
}

function configurePortableStorage(): void {
  const executableDir = app.isPackaged
    ? process.env.PORTABLE_EXECUTABLE_DIR?.trim() || dirname(process.execPath)
    : process.cwd()
  const dataDir = join(executableDir, 'data')
  const legacyDir = join(process.env.APPDATA || '', 'local-calendar')
  if (!existsSync(join(dataDir, 'calendar.db')) && existsSync(join(legacyDir, 'calendar.db'))) {
    mkdirSync(dataDir, { recursive: true })
    copyFileSync(join(legacyDir, 'calendar.db'), join(dataDir, 'calendar.db'))
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(join(legacyDir, `calendar.db${suffix}`))) copyFileSync(join(legacyDir, `calendar.db${suffix}`), join(dataDir, `calendar.db${suffix}`))
    }
  }
  process.env.LOCAL_CALENDAR_DATA_DIR = dataDir
  app.setPath('userData', dataDir)
  app.setPath('sessionData', join(dataDir, 'session'))
  app.setPath('logs', join(dataDir, 'logs'))
}

function getIconPath(): string {
  const candidates = [
    join(__dirname, '../renderer/icon.ico'),
    join(app.getAppPath(), 'src/renderer/icon.ico'),
    join(process.cwd(), 'src/renderer/icon.ico')
  ]
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]
}

configurePortableStorage()
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
  process.exit(0)
}
const svc = new CalendarService(openDatabase())
const { methods, mutating } = createMethodTable(svc)

methods.set('debug.evaluate', async (p: Record<string, unknown>) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('没有可用窗口')
  return win.webContents.executeJavaScript(p.code as string)
})

methods.set('debug.screenshot', async (p: Record<string, unknown>) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('没有可用窗口')
  if (p.view === 'month') {
    await win.webContents.executeJavaScript(`window.__setView && window.__setView('month')`).catch(() => {})
  }
  if (p.dialog === 'create') {
    await win.webContents.executeJavaScript(`window.__openCreate && window.__openCreate()`).catch(() => {})
  }
  if (p.tasks === true) {
    await win.webContents.executeJavaScript(`window.__openTasks && window.__openTasks()`).catch(() => {})
  }
  if (p.view || p.dialog || p.tasks) await new Promise((r) => setTimeout(r, 600))
  const img = await win.webContents.capturePage()
  const dir = join(getDataDir(), 'shots')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `view-${Date.now()}.png`)
  writeFileSync(path, img.toPNG())
  return { path }
})

async function dispatch(
  method: string,
  params: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const fn = methods.get(method)
  if (!fn) return { ok: false, error: `未知方法: ${method}` }
  try {
    return { ok: true, data: await fn(params ?? {}) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

let rpcServer: Server | null = null
let tray: Tray | null = null
let isQuitting = false

function startRpcServer(getWindows: () => BrowserWindow[]): void {
  const token = randomBytes(24).toString('hex')
  rpcServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/rpc') {
      res.writeHead(404).end()
      return
    }
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', async () => {
      let method = ''
      let params: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(body || '{}')
        method = parsed.method
        params = parsed.params ?? {}
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
        return
      }
      const result = await dispatch(method, params)
      if (result.ok && mutating.has(method)) {
        for (const win of getWindows()) win.webContents.send('data-changed', { method })
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    })
  })
  rpcServer.listen(0, '127.0.0.1', () => {
    const addr = rpcServer!.address()
    if (addr && typeof addr === 'object') {
      writeFileSync(getRpcInfoPath(), JSON.stringify({ port: addr.port, token }, null, 2))
      console.log(`[local-calendar] RPC listening on 127.0.0.1:${addr.port}`)
    }
  })
}

function createWindow(): void {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const saved = readWindowState()
  const win = new BrowserWindow({
    width: saved.width ?? Math.min(1440, workArea.width),
    height: saved.height ?? Math.min(860, workArea.height),
    ...(typeof saved.x === 'number' && typeof saved.y === 'number' ? { x: saved.x, y: saved.y } : {}),
    minWidth: 760,
    minHeight: 520,
    center: true,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    frame: false,
    title: '本地日历',
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.on('close', (event) => {
    saveWindowState(win)
    if (isQuitting) return
    event.preventDefault()
    win.hide()
  })
  win.on('system-context-menu', (event) => event.preventDefault())
  win.on('resize', () => saveWindowState(win))
  win.on('move', () => saveWindowState(win))
  win.on('maximize', () => saveWindowState(win))
  win.on('unmaximize', () => saveWindowState(win))
  win.on('ready-to-show', () => {
    if (saved.maximized !== false) win.maximize()
    win.show()
    setTimeout(() => checkReminders(), 1500)
    setTimeout(() => void runAutoBackup(), 5000)
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function focusTarget(kind: 'event' | 'task', id: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  setTimeout(() => {
    void win.webContents.executeJavaScript(`window.__openTarget && window.__openTarget(${JSON.stringify(kind)}, ${JSON.stringify(id)})`).catch(() => {})
  }, 120)
}

function createTray(): void {
  if (tray) return
  try {
    tray = new Tray(getIconPath())
  } catch {
    return
  }
  tray.setToolTip('本地日历')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => BrowserWindow.getAllWindows()[0]?.show())
}

function buildTrayMenu(): Menu {
  const today = DateTime.now().toISODate()!
  let eventItems: Electron.MenuItemConstructorOptions[] = []
  let taskItems: Electron.MenuItemConstructorOptions[] = []
  try {
    eventItems = svc.listEvents(today, today).slice(0, 8).map((event) => ({
      label: `${event.isAllDay ? '全天' : DateTime.fromISO(event.startUtc).toLocal().toFormat('HH:mm')}  ${event.title}`,
      click: () => focusTarget('event', event.id)
    }))
    taskItems = svc.listTaskOccurrences(today, today).filter((task) => task.status === 'needsAction').slice(0, 8).map((task) => ({
      label: task.dueAt ? `${task.title}（${DateTime.fromISO(task.dueAt).toLocal().toFormat('M月d日')}）` : task.title,
      click: () => focusTarget('task', task.id)
    }))
  } catch {
    eventItems = []
    taskItems = []
  }
  return Menu.buildFromTemplate([
    { label: '打开本地日历', click: () => BrowserWindow.getAllWindows()[0]?.show() },
    { type: 'separator' },
    { label: `今日安排（${eventItems.length}）`, submenu: eventItems.length ? eventItems : [{ label: '今天没有日程', enabled: false }] },
    { label: `未完成任务（${taskItems.length}）`, submenu: taskItems.length ? taskItems : [{ label: '没有未完成任务', enabled: false }] },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } }
  ])
}

function importIcsValue(value: string): { value: string; allDay: boolean } | null {
  const clean = value.trim()
  if (/^\d{8}$/.test(clean)) {
    const date = DateTime.fromFormat(clean, 'yyyyMMdd')
    return date.isValid ? { value: date.toFormat('yyyy-MM-dd'), allDay: true } : null
  }
  const date = DateTime.fromFormat(clean.replace(/Z$/, ''), "yyyyMMdd'T'HHmmss", { zone: clean.endsWith('Z') ? 'utc' : 'local' })
  return date.isValid ? { value: date.toISO()!, allDay: false } : null
}

function unescapeIcsValue(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1')
}

function importIcsFile(path: string): number {
  const lines: string[] = []
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1)
    else lines.push(line)
  }
  let fields: Record<string, string> | null = null
  let count = 0
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') fields = {}
    else if (line === 'END:VEVENT' && fields) {
      const start = fields.DTSTART ? importIcsValue(fields.DTSTART) : null
      const end = fields.DTEND ? importIcsValue(fields.DTEND) : null
      if (start && fields.SUMMARY) {
        svc.createEvent({
          title: unescapeIcsValue(fields.SUMMARY),
          description: fields.DESCRIPTION ? unescapeIcsValue(fields.DESCRIPTION) : undefined,
          location: fields.LOCATION ? unescapeIcsValue(fields.LOCATION) : undefined,
          start: start.value,
          end: end?.value ?? (start.allDay ? DateTime.fromISO(start.value).plus({ days: 1 }).toFormat('yyyy-MM-dd') : DateTime.fromISO(start.value).plus({ hours: 1 }).toISO()!),
          isAllDay: start.allDay,
          rrule: fields.RRULE || undefined
        })
        count++
      }
      fields = null
    } else if (fields) {
      const separator = line.indexOf(':')
      if (separator > 0) fields[line.slice(0, separator).split(';')[0].toUpperCase()] = line.slice(separator + 1)
    }
  }
  return count
}

async function runAutoBackup(): Promise<void> {
  if (!app.isPackaged) return
  const backupDir = join(getDataDir(), 'backups')
  mkdirSync(backupDir, { recursive: true })
  const backupPath = join(backupDir, `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  try {
    await svc.backupTo(backupPath)
    const backups = readdirSync(backupDir)
      .filter((name) => name.startsWith('auto-') && name.endsWith('.db'))
      .map((name) => ({ name, time: statSync(join(backupDir, name)).mtimeMs }))
      .sort((first, second) => second.time - first.time)
    for (const old of backups.slice(14)) unlinkSync(join(backupDir, old.name))
  } catch {
    // 自动备份失败不影响应用继续运行
  }
}

// ---------- 提醒调度：每 30 秒检查即将开始的日程 ----------

const firedReminders = new Set<string>()

function fireReminder(evtTitle: string, when: DateTime, leadMin: number, eventId?: string): void {
  if (!readNotificationPreferences().notificationsEnabled) return
  const timeLabel = when.toFormat('HH:mm')
  const body = leadMin > 0 ? `${timeLabel} 开始（提前 ${leadMin} 分钟提醒）` : `${timeLabel} 开始`
  try {
    const n = new Notification({ title: evtTitle, body })
    n.on('click', () => eventId ? focusTarget('event', eventId) : BrowserWindow.getAllWindows()[0]?.show())
    n.show()
  } catch {
    // 系统通知失败时仍显示应用内提示
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app-toast', { message: `提醒：${evtTitle} · ${body}`, kind: 'event', id: eventId })
}

function fireTaskReminder(taskTitle: string, dueAt: DateTime, leadMin: number, taskId?: string): void {
  if (!readNotificationPreferences().notificationsEnabled) return
  const timeLabel = dueAt.toFormat('HH:mm')
  const body = leadMin > 0 ? `截止 ${timeLabel}（提前 ${leadMin} 分钟提醒）` : `截止 ${timeLabel}`
  try {
    const n = new Notification({ title: `任务：${taskTitle}`, body })
    n.on('click', () => taskId ? focusTarget('task', taskId) : BrowserWindow.getAllWindows()[0]?.show())
    n.show()
  } catch {
    // 应用内提示仍会发送
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app-toast', { message: `任务提醒：${taskTitle} · ${body}`, kind: 'task', id: taskId })
}

function checkReminders(): void {
  const now = DateTime.now()
  const from = now.minus({ days: 1 }).toFormat('yyyy-MM-dd')
  const to = now.plus({ days: 8 }).toFormat('yyyy-MM-dd')
  let events
  try {
    events = svc.listEvents(from, to)
  } catch {
    return
  }
  for (const evt of events) {
    if (!evt.reminders?.length) continue
    const start = DateTime.fromISO(evt.startUtc)
    if (!start.isValid) continue
    for (const r of evt.reminders) {
      if (!Number.isFinite(r.minutes) || r.minutes < 0) continue
      const key = `${evt.id}|${evt.startUtc}|${r.minutes}`
      if (firedReminders.has(key)) continue
      const fireAt = start.minus({ minutes: r.minutes })
      if (isReminderDue(now, fireAt)) {
        firedReminders.add(key)
        fireReminder(evt.title, start, r.minutes, evt.id)
      }
    }
  }
  let tasks: Task[]
  try {
    tasks = svc.listTaskOccurrences(from, to).filter((task) => task.status === 'needsAction')
  } catch {
    tasks = []
  }
  for (const task of tasks) {
    if (!task.dueAt || task.reminderMinutes === null) continue
    const dueAt = DateTime.fromISO(task.dueAt)
    if (!dueAt.isValid) continue
    const fireAt = task.reminderMinutes === 900
      ? dueAt.toLocal().startOf('day').plus({ hours: 9 })
      : dueAt.minus({ minutes: task.reminderMinutes })
    const key = `task|${task.id}|${task.updatedAt}|${task.reminderMinutes}`
    if (firedReminders.has(key)) continue
    if (isReminderDue(now, fireAt)) {
      firedReminders.add(key)
      fireTaskReminder(task.title, dueAt, task.reminderMinutes, task.id)
    }
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.local.calendar')
  ipcMain.handle('rpc', async (_e, method: string, params: Record<string, unknown>) => {
    const result = await dispatch(method, params ?? {})
    if (result.ok && mutating.has(method)) {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('data-changed', { method })
    }
    return result
  })
  ipcMain.on('window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('window-toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    win.webContents.send('window-state-changed', win.isMaximized())
  })
  ipcMain.handle('window-is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
  ipcMain.handle('notification-settings:get', () => readNotificationPreferences())
  ipcMain.handle('notification-settings:set', (_event, enabled: boolean) => {
    const preferences = { notificationsEnabled: enabled !== false }
    writeFileSync(preferencesPath(), JSON.stringify(preferences, null, 2))
    return preferences
  })
  ipcMain.handle('print-calendar', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    return new Promise<boolean>((resolve) => {
      win.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'default' } }, (success) => resolve(success))
    })
  })
  ipcMain.on('window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  ipcMain.handle('open-data-dir', async () => {
    const dataDir = getDataDir()
    await shell.openPath(dataDir)
    return dataDir
  })
  ipcMain.handle('backup-data', async () => {
    const result = await dialog.showSaveDialog({
      title: '备份本地日历数据',
      defaultPath: join(getDataDir(), `calendar-backup-${new Date().toISOString().slice(0, 10)}.db`),
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return null
    await svc.backupTo(result.filePath)
    return result.filePath
  })
  ipcMain.handle('restore-data', async () => {
    const result = await dialog.showOpenDialog({
      title: '从备份恢复本地日历',
      properties: ['openFile'],
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    svc.restoreFrom(result.filePaths[0], getDbPath())
    isQuitting = true
    app.relaunch()
    app.exit(0)
    return result.filePaths[0]
  })
  ipcMain.handle('import-ics', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 ICS 日程',
      properties: ['openFile'],
      filters: [{ name: 'iCalendar 文件', extensions: ['ics', 'ical'] }]
    })
    if (result.canceled || !result.filePaths[0]) return 0
    const count = importIcsFile(result.filePaths[0])
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('data-changed', { method: 'events.import' })
    return count
  })
  ipcMain.handle('choose-avatar', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择头像',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const stat = statSync(filePath)
    if (stat.size > 2 * 1024 * 1024) throw new Error('头像图片不能超过 2 MB')
    const ext = filePath.toLowerCase().split('.').pop()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
    return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
  })

  startRpcServer(() => BrowserWindow.getAllWindows())
  createWindow()
  createTray()
  setInterval(() => tray?.setContextMenu(buildTrayMenu()), 60_000)
  setInterval(checkReminders, 30_000)
  setInterval(() => void runAutoBackup(), 6 * 60 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    rpcServer?.close()
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.on('will-quit', () => {
  try {
    rmSync(getRpcInfoPath(), { force: true })
  } catch {
    // 清理失败不影响退出，CLI 侧有连接失败自动回退
  }
})
