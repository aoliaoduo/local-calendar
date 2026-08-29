import { useCallback, useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import TopBar, { type ViewKind } from './components/TopBar'
import SideBar from './components/SideBar'
import WeekView from './components/WeekView'
import MonthView from './components/MonthView'
import YearView from './components/YearView'
import AgendaView from './components/AgendaView'
import EventDialog, { type DialogState } from './components/EventDialog'
import TasksPanel from './components/TasksPanel'
import SettingsDialog from './components/SettingsDialog'
import DayAgendaDialog from './components/DayAgendaDialog'
import HelpDialog from './components/HelpDialog'
import RecycleBinDialog from './components/RecycleBinDialog'
import AppearanceDialog from './components/AppearanceDialog'
import ProfileDialog from './components/ProfileDialog'
import CalendarEditDialog from './components/CalendarEditDialog'
import TaskDialog from './components/TaskDialog'
import { api, type AppToastInfo, type CalendarInfo, type EventInfo, type TaskInfo } from './api'
import { weekDates } from './dateUtils'

export default function App() {
  const [view, setView] = useState<ViewKind>(() => (localStorage.getItem('local-calendar.default-view') as ViewKind) || 'week')
  const [weekStart, setWeekStart] = useState<0 | 1>(() => localStorage.getItem('local-calendar.week-start') === '1' ? 1 : 0)
  const [cursor, setCursor] = useState(() => DateTime.now())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [events, setEvents] = useState<EventInfo[]>([])
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const [taskOccurrences, setTaskOccurrences] = useState<TaskInfo[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppToastInfo[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agendaDay, setAgendaDay] = useState<DateTime | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [recycleOpen, setRecycleOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [calendarToEdit, setCalendarToEdit] = useState<CalendarInfo | null>(null)
  const [taskToEdit, setTaskToEdit] = useState<TaskInfo | null>(null)
  const [taskOccurrenceIndex, setTaskOccurrenceIndex] = useState<number | undefined>(undefined)
  const [taskOccurrenceDue, setTaskOccurrenceDue] = useState<string | undefined>(undefined)
  const [username, setUsername] = useState(() => localStorage.getItem('local-calendar.username') || '本地用户')
  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem('local-calendar.avatar-color') || '#4285f4')
  const [avatarImage, setAvatarImage] = useState<string | null>(() => localStorage.getItem('local-calendar.avatar-image'))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('local-calendar.theme') as 'light' | 'dark') || 'light')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  const loadCalendars = useCallback(async () => {
    setCalendars(await api.listCalendars())
  }, [])

  const getVisibleRange = useCallback(() => {
    const from = (view === 'year' ? cursor.startOf('year') : cursor.startOf('month').minus({ months: 2 })).toFormat('yyyy-MM-dd')
    const to = (view === 'year' ? cursor.endOf('year') : cursor.endOf('month').plus({ months: 2 })).toFormat('yyyy-MM-dd')
    return { from, to }
  }, [cursor, view])

  const loadEvents = useCallback(async () => {
    const { from, to } = getVisibleRange()
    setEvents(await api.listEvents(from, to))
  }, [getVisibleRange])

  const loadTasks = useCallback(async () => {
    setTasks(await api.listTasks('all'))
  }, [])

  const loadTaskOccurrences = useCallback(async () => {
    const { from, to } = getVisibleRange()
    setTaskOccurrences(await api.listTaskOccurrences(from, to))
  }, [getVisibleRange])

  const loadBootstrap = useCallback(async () => {
    const { from, to } = getVisibleRange()
    const snapshot = await api.bootstrap(from, to)
    setCalendars(snapshot.calendars)
    setEvents(snapshot.events)
    setTasks(snapshot.tasks)
    setTaskOccurrences(snapshot.taskOccurrences)
  }, [getVisibleRange])

  useEffect(() => {
    void window.calendarApi.getNotificationSettings().then((settings) => setNotificationsEnabled(settings.notificationsEnabled)).catch(() => {})
    void window.calendarApi.getProfile().then((profile) => {
      setUsername(profile.username)
      setAvatarColor(profile.avatarColor)
      setAvatarImage(profile.avatarImage)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    void loadBootstrap().catch((error) => setToast(error instanceof Error ? error.message : '加载日历数据失败'))
  }, [loadBootstrap])

  useEffect(() => {
    const w = window as unknown as { __setView?: (v: ViewKind) => void; __openCreate?: () => void; __openTasks?: () => void; __openTarget?: (kind: 'event' | 'task', id: string) => void }
    w.__setView = setView
    w.__openCreate = () => setDialog({ mode: 'create', day: DateTime.now(), hour: Math.min(23, DateTime.now().hour + 1) })
    w.__openTasks = () => setTasksOpen(true)
    w.__openTarget = (kind, id) => {
      const baseId = id.replace(/#\d+$/, '')
      if (kind === 'task') {
        const task = tasks.find((item) => item.id === baseId)
        if (task) {
          const occurrenceMatch = id.match(/#(\d+)$/)
          const occurrenceIndex = occurrenceMatch ? Number(occurrenceMatch[1]) : undefined
          if (occurrenceIndex === undefined) {
            setCursor(task.dueAt ? DateTime.fromISO(task.dueAt) as DateTime<true> : DateTime.now())
            setView('day')
            setTaskOccurrenceIndex(undefined)
            setTaskOccurrenceDue(undefined)
            setTaskToEdit(task)
          } else {
            const from = task.dueAt ? DateTime.fromISO(task.dueAt).minus({ days: 1 }).toFormat('yyyy-MM-dd') : DateTime.now().toFormat('yyyy-MM-dd')
            const to = task.dueAt ? DateTime.fromISO(task.dueAt).plus({ years: 3 }).toFormat('yyyy-MM-dd') : DateTime.now().plus({ years: 1 }).toFormat('yyyy-MM-dd')
            void api.listTaskOccurrences(from, to).then((occurrences) => {
              const occurrence = occurrences.find((item) => item.id === id)
              const due = occurrence?.dueAt ?? task.dueAt
              setCursor(due ? DateTime.fromISO(due) as DateTime<true> : DateTime.now())
              setView('day')
              setTaskOccurrenceIndex(occurrenceIndex)
              setTaskOccurrenceDue(due ?? undefined)
              setTaskToEdit(task)
            }).catch(() => {})
          }
        }
      } else {
        const open = (event: EventInfo) => {
          setCursor(DateTime.fromISO(event.startUtc) as DateTime<true>)
          setView('day')
          openEvent(event)
        }
        const event = events.find((item) => item.id === id || item.id === baseId)
        if (event) open(event)
        else {
          const from = DateTime.now().minus({ years: 1 }).toFormat('yyyy-MM-dd')
          const to = DateTime.now().plus({ years: 1 }).toFormat('yyyy-MM-dd')
          void api.listEvents(from, to).then((found) => {
            const match = found.find((item) => item.id === id || item.id === baseId)
            if (match) open(match)
          }).catch(() => {})
        }
      }
    }
  }, [events, tasks])

  useEffect(() => {
    const off = window.calendarApi.onDataChanged(() => {
      void loadBootstrap().catch((error) => setToast(error instanceof Error ? error.message : '刷新日历数据失败'))
    })
    return off
  }, [loadBootstrap])

  useEffect(() => window.calendarApi.onTitlebarPointerDown(() => {
    dismissTransient()
  }), [])

  useEffect(() => window.calendarApi.onAppToast((payload) => {
    const item: AppToastInfo = typeof payload === 'string' ? { message: payload } : payload
    setToast(item.message)
    setNotifications((current) => [item, ...current].slice(0, 40))
  }), [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('local-calendar.theme', theme)
  }, [theme])

  const setPreferredView = (nextView: ViewKind) => {
    setView(nextView)
    localStorage.setItem('local-calendar.default-view', nextView)
  }

  const updateProfile = (nextUsername: string, nextAvatarColor: string) => {
    setUsername(nextUsername.trim() || '本地用户')
    setAvatarColor(nextAvatarColor)
    localStorage.setItem('local-calendar.username', nextUsername.trim() || '本地用户')
    localStorage.setItem('local-calendar.avatar-color', nextAvatarColor)
    void window.calendarApi.setProfile({ username: nextUsername, avatarColor: nextAvatarColor, avatarImage })
  }

  const updateAvatarImage = (image: string | null) => {
    setAvatarImage(image)
    if (image) localStorage.setItem('local-calendar.avatar-image', image)
    else localStorage.removeItem('local-calendar.avatar-image')
    void window.calendarApi.setProfile({ username, avatarColor, avatarImage: image })
  }

  const saveProfile = (nextUsername: string, nextAvatarColor: string, nextAvatarImage: string | null) => {
    const normalizedName = nextUsername.trim() || '本地用户'
    setUsername(normalizedName)
    setAvatarColor(nextAvatarColor)
    setAvatarImage(nextAvatarImage)
    localStorage.setItem('local-calendar.username', normalizedName)
    localStorage.setItem('local-calendar.avatar-color', nextAvatarColor)
    if (nextAvatarImage) localStorage.setItem('local-calendar.avatar-image', nextAvatarImage)
    else localStorage.removeItem('local-calendar.avatar-image')
    void window.calendarApi.setProfile({ username: normalizedName, avatarColor: nextAvatarColor, avatarImage: nextAvatarImage })
  }

  const dismissTransient = () => {
    setDialog(null)
    setTaskToEdit(null)
    setTaskOccurrenceIndex(undefined)
    setTaskOccurrenceDue(undefined)
    setCalendarToEdit(null)
    setProfileOpen(false)
    setAgendaDay(null)
    setSettingsOpen(false)
    setAppearanceOpen(false)
    setHelpOpen(false)
    setRecycleOpen(false)
    document.dispatchEvent(new Event('calendar-transient-dismiss'))
  }

  const dates = useMemo(() => {
    if (view === 'day') return [cursor.startOf('day')]
    if (view === '4day') return Array.from({ length: 4 }, (_, index) => cursor.startOf('day').plus({ days: index }))
    return weekDates(cursor, weekStart)
  }, [view, cursor.toISODate(), weekStart])

  const displayCalendars = useMemo(() => [
    ...calendars,
    { id: 'tasks', name: '任务', color: '#5f6368', isPrimary: false, isVisible: true }
  ], [calendars])

  const calendarEvents = useMemo<EventInfo[]>(() => [
    ...events,
    ...taskOccurrences.filter((task) => task.dueAt).map((task) => {
      const day = DateTime.fromISO(task.dueAt!).startOf('day')
      return {
        id: `task-${task.id}`,
        calendarId: 'tasks',
        title: task.title,
        description: task.notes,
        location: null,
        startUtc: day.toUTC().toISO()!,
        endUtc: day.endOf('day').toUTC().toISO()!,
        isAllDay: true,
        colorOverride: task.status === 'completed' ? '#9aa0a6' : '#5f6368',
        rrule: task.rrule,
        reminders: []
      }
    })
  ], [events, taskOccurrences])

  const title = useMemo(() => {
    if (view === 'month' || view === 'week' || view === '4day') {
      const weekStart = view === 'month' ? cursor.startOf('month') : dates[0]
      const weekEnd = view === 'month' ? cursor.endOf('month') : dates[dates.length - 1]
      if (weekStart.year === weekEnd.year && weekStart.month === weekEnd.month) {
        return weekStart.toFormat('yyyy年M月')
      }
      if (weekStart.year === weekEnd.year) {
        return `${weekStart.toFormat('M月')} – ${weekEnd.toFormat('M月')}`
      }
      return `${weekStart.toFormat('yyyy年M月')} – ${weekEnd.toFormat('yyyy年M月')}`
    }
    if (view === 'year') return cursor.toFormat('yyyy年')
    if (view === 'agenda') return '日程'
    return cursor.toFormat('M月d日 EEEE')
  }, [view, dates, cursor.toISODate()])

  const step = (dir: 1 | -1) => {
    if (view === 'day') setCursor(cursor.plus({ days: dir }))
    else if (view === 'week') setCursor(cursor.plus({ weeks: dir }))
    else if (view === '4day') setCursor(cursor.plus({ days: dir * 4 }))
    else if (view === 'year') setCursor(cursor.plus({ years: dir }))
    else setCursor(cursor.plus({ months: dir }))
  }

  const handleToggleCalendar = async (id: string, visible: boolean) => {
    try {
      await api.updateCalendar(id, { isVisible: visible })
      await loadCalendars()
      await loadEvents()
    } catch (err) {
      setToast(err instanceof Error ? err.message : '切换日历失败')
    }
  }

  const openEvent = (evt: EventInfo) => {
    if (evt.calendarId === 'tasks') {
      const taskId = evt.id.slice('task-'.length).replace(/#\d+$/, '')
      const task = tasks.find((item) => item.id === taskId)
      if (task) {
        const match = evt.id.match(/#(\d+)$/)
        setTaskOccurrenceIndex(match ? Number(match[1]) : undefined)
        setTaskOccurrenceDue(evt.startUtc)
        setTaskToEdit(task)
      }
      return
    }
    if (evt.calendarId === 'holidays') {
      setToast('节假日为内置只读日历')
      return
    }
    const occurrenceMatch = evt.id.match(/#(\d+)$/)
    const baseId = occurrenceMatch ? evt.id.slice(0, -occurrenceMatch[0].length) : evt.id
    setDialog({
      mode: 'edit',
      event: baseId === evt.id ? evt : { ...evt, id: baseId },
      ...(occurrenceMatch ? { occurrenceIndex: Number(occurrenceMatch[1]) } : {})
    })
  }

  const handleEventMove = async (id: string, start: DateTime, end: DateTime) => {
    if (id.startsWith('task-')) {
      const taskId = id.slice('task-'.length).replace(/#\d+$/, '')
      const task = tasks.find((item) => item.id === taskId)
      if (task) {
        const occurrenceMatch = id.match(/#(\d+)$/)
        const save = occurrenceMatch
          ? api.updateTaskOccurrence(task.id, Number(occurrenceMatch[1]), { dueAt: start.toISODate() })
          : api.updateTask(task.id, { dueAt: start.toISODate() })
        void save.then(() => { void loadBootstrap(); setToast(occurrenceMatch ? '已更新此任务实例' : '已更新任务截止日期') }).catch((err) => setToast(err instanceof Error ? err.message : '更新任务失败'))
      }
      return
    }
    try {
      await api.updateEvent(id, { start: start.toISO()!, end: end.toISO()! })
      await loadEvents()
    } catch (err) {
      setToast(err instanceof Error ? err.message : '移动失败')
    }
  }

  const handleCalendarCreate = async (name: string, color: string) => {
    await api.createCalendar({ name, color })
    await loadCalendars()
    setToast('已添加日历')
  }

  const handleCalendarUpdate = async (id: string, patch: { name?: string; color?: string }) => {
    await api.updateCalendar(id, patch)
    await loadCalendars()
    setToast('已更新日历')
  }

  const handleCalendarDelete = async (id: string) => {
    const calendar = calendars.find((item) => item.id === id)
    if (!calendar || !window.confirm(`删除日历“${calendar.name}”？其中的日程将移到“个人”日历。`)) return
    await api.deleteCalendar(id)
    await loadCalendars()
    await loadEvents()
    setToast('已删除日历，日程已移至个人日历')
  }

  const handleOpenDataDir = async () => {
    return window.calendarApi.openDataDir()
  }

  const handleBackup = async () => {
    const path = await window.calendarApi.backupData()
    if (path) setToast(`数据已备份：${path}`)
    return path
  }

  const handleRestore = async () => {
    const path = await window.calendarApi.restoreData()
    if (path) setToast('正在恢复数据并重启应用…')
    return path
  }

  const handleImportIcs = async () => {
    const count = await window.calendarApi.importIcs()
    if (count > 0) {
      await loadEvents()
      setToast(`已导入 ${count} 条日程`)
    }
    return count
  }

  return (
    <div className="app">
      <TopBar
        view={view}
        title={title}
        cursor={cursor}
        calendars={calendars}
        onViewChange={setPreferredView}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={() => setCursor(DateTime.now())}
        tasksOpen={tasksOpen}
        onToggleTasks={() => setTasksOpen((v) => !v)}
        onToast={setToast}
        onSettings={() => setSettingsOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onPrint={() => { void window.calendarApi.printCalendar().then((printed) => { if (!printed) setToast('打印已取消或失败') }) }}
        onRecycle={() => setRecycleOpen(true)}
        onAppearance={() => setAppearanceOpen(true)}
        onAvatarClick={() => setProfileOpen(true)}
        username={username}
        avatarColor={avatarColor}
        avatarImage={avatarImage}
        notifications={notifications}
        onNotificationClick={(item) => {
          if (item.kind && item.id) {
            const w = window as unknown as { __openTarget?: (kind: 'event' | 'task', id: string) => void }
            w.__openTarget?.(item.kind, item.id)
          }
        }}
        onClearNotifications={() => setNotifications([])}
        onTransientDismiss={dismissTransient}
        onSearchPick={(evt) => {
          setCursor(DateTime.fromISO(evt.startUtc) as DateTime<true>)
          setView('day')
          openEvent(evt)
        }}
      />

      <SideBar
          calendars={calendars}
          anchor={cursor}
          onAnchorChange={(d) => {
            setCursor(d as DateTime<true>)
            setView('day')
          }}
          onCreate={() =>
            setDialog({ mode: 'create', day: DateTime.now(), hour: Math.min(23, DateTime.now().hour + 1) })
          }
          onToggleCalendar={handleToggleCalendar}
          onCreateCalendar={handleCalendarCreate}
          onEditCalendar={setCalendarToEdit}
          onDeleteCalendar={(calendar) => { void handleCalendarDelete(calendar.id) }}
          weekStart={weekStart}
          collapsed={!sidebarOpen}
        />

      <main className={`content${tasksOpen ? ' with-tasks' : ''}`}>
        {view === 'month' ? (
          <MonthView
            anchor={cursor}
            events={calendarEvents}
            calendars={displayCalendars}
            onEventClick={openEvent}
            onDayClick={(d) => setDialog({ mode: 'create', day: d, allDay: true })}
            onDayDetails={setAgendaDay}
            onEventMove={handleEventMove}
            weekStart={weekStart}
          />
        ) : view === 'year' ? (
          <YearView anchor={cursor} events={calendarEvents} calendars={displayCalendars} onMonthClick={(month) => { setCursor(month as DateTime<true>); setPreferredView('month') }} weekStart={weekStart} />
        ) : view === 'agenda' ? (
          <AgendaView anchor={cursor} events={calendarEvents} calendars={displayCalendars} onEventClick={openEvent} />
        ) : (
          <WeekView
            dates={dates}
            events={calendarEvents}
            calendars={displayCalendars}
            onEventClick={openEvent}
            onSlotClick={(day, hour) => setDialog({ mode: 'create', day, hour })}
            onDayNumClick={(d) => {
              setCursor(d as DateTime<true>)
              setView('day')
            }}
            onEventMove={handleEventMove}
            onRangeSelect={(start, end) => setDialog({ mode: 'create', day: start.startOf('day'), start, end })}
            onSlotDoubleClick={(day, hour) => setDialog({ mode: 'create', day, hour, detailed: true })}
            weekStart={weekStart}
          />
        )}
      </main>

      {tasksOpen && <TasksPanel onClose={() => setTasksOpen(false)} onToast={setToast} />}

      {dialog && (
        <EventDialog
          state={dialog}
          calendars={calendars}
          onClose={() => setDialog(null)}
          onSaved={(msg) => setToast(msg)}
          onCreateTask={async (input) => { await api.createTask(input); await loadBootstrap() }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          view={view}
          onViewChange={setPreferredView}
          weekStart={weekStart}
          onWeekStartChange={(value) => { setWeekStart(value); localStorage.setItem('local-calendar.week-start', String(value)) }}
          onOpenDataDir={handleOpenDataDir}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onImportIcs={handleImportIcs}
          onOpenRecycleBin={() => setRecycleOpen(true)}
          notificationsEnabled={notificationsEnabled}
          onNotificationsChange={(enabled) => { setNotificationsEnabled(enabled); void window.calendarApi.setNotificationSettings(enabled) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {helpOpen && <HelpDialog calendars={calendars} onClose={() => setHelpOpen(false)} />}
      {recycleOpen && <RecycleBinDialog onClose={() => setRecycleOpen(false)} onToast={setToast} />}
      {appearanceOpen && <AppearanceDialog theme={theme} onThemeChange={setTheme} onClose={() => setAppearanceOpen(false)} />}
      {profileOpen && <ProfileDialog username={username} avatarColor={avatarColor} avatarImage={avatarImage} onSave={(name, color, image) => { saveProfile(name, color, image); setProfileOpen(false) }} onClose={() => setProfileOpen(false)} />}
      {calendarToEdit && <CalendarEditDialog calendar={calendarToEdit} onSave={(patch) => handleCalendarUpdate(calendarToEdit.id, patch)} onClose={() => setCalendarToEdit(null)} />}
      {taskToEdit && <TaskDialog task={taskToEdit} occurrenceIndex={taskOccurrenceIndex} occurrenceDue={taskOccurrenceDue} onClose={() => { setTaskToEdit(null); setTaskOccurrenceIndex(undefined); setTaskOccurrenceDue(undefined) }} onSaved={(message) => { setTaskToEdit(null); setTaskOccurrenceIndex(undefined); setTaskOccurrenceDue(undefined); setToast(message); void loadTasks(); void loadTaskOccurrences() }} />}

      {agendaDay && (
        <DayAgendaDialog
          day={agendaDay}
          events={events}
          calendars={calendars}
          onClose={() => setAgendaDay(null)}
          onEventClick={openEvent}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
