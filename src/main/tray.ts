import { Menu, Tray } from 'electron'
import { DateTime } from 'luxon'
import type { CalendarService } from '../shared/service'

type TargetKind = 'event' | 'task'

export function createTrayManager(
  service: CalendarService,
  iconPath: string,
  openWindow: () => void,
  focusTarget: (kind: TargetKind, id: string) => void,
  quit: () => void
): { create: () => void; refresh: () => void } {
  let tray: Tray | null = null

  const buildMenu = (): Menu => {
    const today = DateTime.now().toISODate()!
    let eventItems: Electron.MenuItemConstructorOptions[] = []
    let taskItems: Electron.MenuItemConstructorOptions[] = []
    let overdueItems: Electron.MenuItemConstructorOptions[] = []
    try {
      eventItems = service.listEvents(today, today).slice(0, 8).map((event) => ({
        label: `${event.isAllDay ? '全天' : DateTime.fromISO(event.startUtc).toLocal().toFormat('HH:mm')}  ${event.title}`,
        click: () => focusTarget('event', event.id)
      }))
      taskItems = service.listTaskOccurrences(today, today).filter((task) => task.status === 'needsAction').sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '')).slice(0, 8).map((task) => ({
        label: task.dueAt ? `${task.title}（${DateTime.fromISO(task.dueAt).toLocal().toFormat('M月d日')}）` : task.title,
        click: () => focusTarget('task', task.id)
      }))
      overdueItems = service.listTaskOccurrences(DateTime.now().minus({ years: 2 }).toFormat('yyyy-MM-dd'), today).filter((task) => task.status === 'needsAction' && task.dueAt && DateTime.fromISO(task.dueAt).toLocal().toISODate()! < today).sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '')).slice(0, 8).map((task) => ({
        label: task.dueAt ? `${task.title}（${DateTime.fromISO(task.dueAt).toLocal().toFormat('M月d日')}）` : task.title,
        click: () => focusTarget('task', task.id)
      }))
    } catch {
      eventItems = []
      taskItems = []
      overdueItems = []
    }
    return Menu.buildFromTemplate([
      { label: '打开本地日历', click: openWindow },
      { type: 'separator' },
      { label: `已逾期任务（${overdueItems.length}）`, submenu: overdueItems.length ? overdueItems : [{ label: '没有逾期任务', enabled: false }] },
      { label: `今日安排（${eventItems.length}）`, submenu: eventItems.length ? eventItems : [{ label: '今天没有日程', enabled: false }] },
      { label: `未完成任务（${taskItems.length}）`, submenu: taskItems.length ? taskItems : [{ label: '没有未完成任务', enabled: false }] },
      { type: 'separator' },
      { label: '退出', click: quit }
    ])
  }

  const refresh = (): void => {
    if (tray) tray.setContextMenu(buildMenu())
  }

  const create = (): void => {
    if (tray) return
    try {
      tray = new Tray(iconPath)
      tray.setToolTip('本地日历')
      refresh()
      tray.on('double-click', openWindow)
    } catch {
      tray = null
    }
  }

  return { create, refresh }
}
