import { app, BrowserWindow, dialog, ipcMain, screen, shell, Notification } from 'electron'
import { dirname, extname, join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { openDatabase } from '../shared/db'
import { CalendarService } from '../shared/service'
import { createMethodTable } from '../shared/rpc-methods'
import { getDbPath, getRpcInfoPath, getDataDir } from '../shared/paths'
import type { Task } from '../shared/types'
import { isReminderDue } from '../shared/reminders'
import { parseIcsEvents } from '../shared/ics'
import { createTrayManager } from './tray'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, readdirSync, statSync, unlinkSync } from 'node:fs'

const windowStatePath = () => join(getDataDir(), 'window-state.json')
const preferencesPath = () => join(getDataDir(), 'preferences.json')
interface NotificationPreferences { notificationsEnabled: boolean }
interface UserPreferences extends NotificationPreferences { username?: string; avatarColor?: string; avatarImage?: string | null }
function readPreferences(): UserPreferences {
  try {
    const value = JSON.parse(readFileSync(preferencesPath(), 'utf8')) as Partial<UserPreferences>
    return {
      notificationsEnabled: value.notificationsEnabled !== false,
      username: typeof value.username === 'string' ? value.username : undefined,
      avatarColor: typeof value.avatarColor === 'string' ? value.avatarColor : undefined,
      avatarImage: typeof value.avatarImage === 'string' ? value.avatarImage : null
    }
  } catch {
    return { notificationsEnabled: true }
  }
}
function readNotificationPreferences(): NotificationPreferences {
  return { notificationsEnabled: readPreferences().notificationsEnabled !== false }
}
interface WindowState { x?: number; y?: number; width?: number; height?: number; maximized?: boolean }
function readWindowState(): WindowState {
  try {
    const value = JSON.parse(readFileSync(windowStatePath(), 'utf8')) as Partial<WindowState>
    const finite = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input)
    return {
      ...(finite(value.x) ? { x: Math.round(value.x) } : {}),
      ...(finite(value.y) ? { y: Math.round(value.y) } : {}),
      ...(finite(value.width) && value.width >= 760 && value.width <= 10000 ? { width: Math.round(value.width) } : {}),
      ...(finite(value.height) && value.height >= 520 && value.height <= 10000 ? { height: Math.round(value.height) } : {}),
      ...(typeof value.maximized === 'boolean' ? { maximized: value.maximized } : {})
    }
  } catch {
    return {}
  }
}
function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.isMaximized() ? undefined : win.getBounds()
    const previous = readWindowState()
    writeJsonAtomic(windowStatePath(), { ...previous, ...(bounds ?? {}), maximized: win.isMaximized() })
  } catch { /* 状态保存失败不影响应用 */ }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tempPath = `${path}.${process.pid}.tmp`
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tempPath, path)
}
let windowStateTimer: NodeJS.Timeout | null = null
function scheduleWindowStateSave(win: BrowserWindow): void {
  if (windowStateTimer) clearTimeout(windowStateTimer)
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null
    saveWindowState(win)
  }, 150)
}

function configurePortableStorage(): void {
  const executableDir = app.isPackaged
    ? process.env.PORTABLE_EXECUTABLE_DIR?.trim() || dirname(process.execPath)
    : process.cwd()
  const dataDir = join(executableDir, 'data')
  process.env.LOCAL_CALENDAR_DATA_DIR = dataDir
  getDataDir()
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

function attachmentMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.txt' || ext === '.md') return 'text/plain'
  return 'application/octet-stream'
}

function safeAttachmentName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(-160) || 'attachment'
}

configurePortableStorage()
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
  process.exit(0)
}
const svc = new CalendarService(openDatabase())
const { methods, mutating } = createMethodTable(svc)
let isQuitting = false
const trayManager = createTrayManager(
  svc,
  getIconPath(),
  () => BrowserWindow.getAllWindows()[0]?.show(),
  focusTarget,
  () => { isQuitting = true; app.quit() }
)

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
const MAX_RPC_BODY_BYTES = 1_000_000

function publishDataChanged(method: string, windows: BrowserWindow[]): void {
  trayManager.refresh()
  for (const win of windows) win.webContents.send('data-changed', { method })
}

function startRpcServer(getWindows: () => BrowserWindow[]): void {
  const token = randomBytes(24).toString('hex')
  rpcServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/rpc') {
      res.writeHead(404).end()
      return
    }
    const contentLength = Number(req.headers['content-length'])
    if (Number.isFinite(contentLength) && contentLength > MAX_RPC_BODY_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'request body too large' }))
      req.resume()
      return
    }
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
      return
    }
    let body = ''
    let tooLarge = false
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      if (tooLarge) return
      body += chunk
      if (Buffer.byteLength(body, 'utf8') > MAX_RPC_BODY_BYTES) {
        tooLarge = true
        body = ''
      }
    })
    req.on('end', async () => {
      if (tooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'request body too large' }))
        return
      }
      let method = ''
      let params: Record<string, unknown> = {}
      let parsed: { method?: unknown; params?: unknown }
      try {
        parsed = JSON.parse(body || '{}') as { method?: unknown; params?: unknown }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
        return
      }
      if (typeof parsed.method !== 'string' || (parsed.params !== undefined && (typeof parsed.params !== 'object' || parsed.params === null || Array.isArray(parsed.params)))) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid RPC request' }))
        return
      }
      method = parsed.method
      params = (parsed.params as Record<string, unknown> | undefined) ?? {}
      const result = await dispatch(method, params)
      if (result.ok && mutating.has(method)) {
        publishDataChanged(method, getWindows())
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
  const workArea = screen.getPrimaryDisplay().workArea
  const saved = readWindowState()
  const width = Math.min(saved.width ?? 1440, workArea.width)
  const height = Math.min(saved.height ?? 860, workArea.height)
  const hasVisiblePosition = typeof saved.x === 'number'
    && typeof saved.y === 'number'
    && screen.getAllDisplays().some((display) => {
      const area = display.workArea
      return saved.x! < area.x + area.width && saved.x! + width > area.x
        && saved.y! < area.y + area.height && saved.y! + height > area.y
    })
  const win = new BrowserWindow({
    width,
    height,
    ...(hasVisiblePosition ? { x: saved.x, y: saved.y } : {}),
    minWidth: 760,
    minHeight: 520,
    center: !hasVisiblePosition,
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
  win.webContents.on('input-event', (_event, input) => {
    const y = (input as { y?: unknown }).y
    if (input.type === 'mouseDown' && typeof y === 'number' && y < 68) {
      win.webContents.send('titlebar-pointerdown')
    }
  })
  win.on('resize', () => scheduleWindowStateSave(win))
  win.on('move', () => scheduleWindowStateSave(win))
  win.on('maximize', () => scheduleWindowStateSave(win))
  win.on('unmaximize', () => scheduleWindowStateSave(win))
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

function importIcsFile(path: string): number {
  const events = parseIcsEvents(readFileSync(path, 'utf8'))
  for (const event of events) svc.createEvent(event)
  return events.length
}

function pruneManagedBackups(backupDir: string, prefix: string, keep: number): void {
  const backups = readdirSync(backupDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.db'))
    .map((name) => ({ name, time: statSync(join(backupDir, name)).mtimeMs }))
    .sort((first, second) => second.time - first.time)
  for (const old of backups.slice(keep)) unlinkSync(join(backupDir, old.name))
}

async function runAutoBackup(): Promise<void> {
  if (!app.isPackaged) return
  const backupDir = join(getDataDir(), 'backups')
  mkdirSync(backupDir, { recursive: true })
  const backupPath = join(backupDir, `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  try {
    await svc.backupTo(backupPath)
    pruneManagedBackups(backupDir, 'auto-', 14)
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
  const body = leadMin === 900 ? `截止日期当天 09:00 提醒（截止 ${timeLabel}）` : leadMin > 0 ? `截止 ${timeLabel}（提前 ${leadMin} 分钟提醒）` : `截止 ${timeLabel}`
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
  if (firedReminders.size > 2000) {
    const recent = [...firedReminders].slice(-1000)
    firedReminders.clear()
    recent.forEach((key) => firedReminders.add(key))
  }
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
      publishDataChanged(method, BrowserWindow.getAllWindows())
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
    const preferences = { ...readPreferences(), notificationsEnabled: enabled !== false }
    writeJsonAtomic(preferencesPath(), preferences)
    return preferences
  })
  ipcMain.handle('profile:get', () => {
    const preferences = readPreferences()
    return { username: preferences.username || '本地用户', avatarColor: preferences.avatarColor || '#4285f4', avatarImage: preferences.avatarImage || null }
  })
  ipcMain.handle('profile:set', (_event, profile: { username?: string; avatarColor?: string; avatarImage?: string | null }) => {
    const preferences = { ...readPreferences(), username: profile.username?.trim() || '本地用户', avatarColor: profile.avatarColor || '#4285f4', avatarImage: profile.avatarImage || null }
    writeJsonAtomic(preferencesPath(), preferences)
    return { username: preferences.username, avatarColor: preferences.avatarColor, avatarImage: preferences.avatarImage }
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
    const backupDir = join(getDataDir(), 'backups')
    mkdirSync(backupDir, { recursive: true })
    await svc.backupTo(join(backupDir, `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`))
    try {
      pruneManagedBackups(backupDir, 'before-restore-', 10)
    } catch {
      // 清理旧快照失败不应阻止当前恢复
    }
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
    publishDataChanged('events.import', BrowserWindow.getAllWindows())
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
  ipcMain.handle('choose-attachment', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择附件',
      properties: ['openFile']
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const stat = statSync(filePath)
    if (stat.size > 8 * 1024 * 1024) throw new Error('附件不能超过 8 MB')
    return {
      name: safeAttachmentName(filePath.split(/[\\/]/).pop() || 'attachment'),
      mimeType: attachmentMimeType(filePath),
      contentBase64: readFileSync(filePath).toString('base64')
    }
  })
  ipcMain.handle('open-attachment', async (_event, id: string) => {
    const found = svc.getAttachmentContent(id)
    if (!found) throw new Error('附件不存在')
    const cacheDir = join(getDataDir(), 'attachment-cache')
    mkdirSync(cacheDir, { recursive: true })
    const path = join(cacheDir, `${randomUUID()}-${safeAttachmentName(found.attachment.name)}`)
    writeFileSync(path, found.content)
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
    return path
  })

  startRpcServer(() => BrowserWindow.getAllWindows())
  createWindow()
  trayManager.create()
  setInterval(trayManager.refresh, 60_000)
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
