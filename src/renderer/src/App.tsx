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
import { api, type CalendarInfo, type EventInfo, type TaskInfo } from './api'
import { weekDates } from './dateUtils'

export default function App() {
  const [view, setView] = useState<ViewKind>(() => (localStorage.getItem('local-calendar.default-view') as ViewKind) || 'week')
  const [cursor, setCursor] = useState(() => DateTime.now())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [events, setEvents] = useState<EventInfo[]>([])
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agendaDay, setAgendaDay] = useState<DateTime | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [recycleOpen, setRecycleOpen] = useState(false)
  const [username, setUsername] = useState(() => localStorage.getItem('local-calendar.username') || '本地用户')
  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem('local-calendar.avatar-color') || '#4285f4')
  const [avatarImage, setAvatarImage] = useState<string | null>(() => localStorage.getItem('local-calendar.avatar-image'))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('local-calendar.theme') as 'light' | 'dark') || 'light')

  const loadCalendars = useCallback(async () => {
    setCalendars(await api.listCalendars())
  }, [])

  const loadEvents = useCallback(async () => {
    const from = (view === 'year' ? cursor.startOf('year') : cursor.startOf('month').minus({ months: 2 })).toFormat('yyyy-MM-dd')
    const to = (view === 'year' ? cursor.endOf('year') : cursor.endOf('month').plus({ months: 2 })).toFormat('yyyy-MM-dd')
    setEvents(await api.listEvents(from, to))
  }, [cursor, view])

  const loadTasks = useCallback(async () => {
    setTasks(await api.listTasks('all'))
  }, [])

  useEffect(() => {
    void loadCalendars()
  }, [loadCalendars])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    const w = window as unknown as { __setView?: (v: ViewKind) => void; __openCreate?: () => void; __openTasks?: () => void }
    w.__setView = setView
    w.__openCreate = () => setDialog({ mode: 'create', day: DateTime.now(), hour: Math.min(23, DateTime.now().hour + 1) })
    w.__openTasks = () => setTasksOpen(true)
  }, [])

  useEffect(() => {
    const off = window.calendarApi.onDataChanged(() => {
      void loadCalendars()
      void loadEvents()
      void loadTasks()
    })
    return off
  }, [loadCalendars, loadEvents, loadTasks])

  useEffect(() => window.calendarApi.onAppToast(setToast), [])

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
  }

  const updateAvatarImage = (image: string | null) => {
    setAvatarImage(image)
    if (image) localStorage.setItem('local-calendar.avatar-image', image)
    else localStorage.removeItem('local-calendar.avatar-image')
  }

  const dates = useMemo(() => {
    if (view === 'day') return [cursor.startOf('day')]
    if (view === '4day') return Array.from({ length: 4 }, (_, index) => cursor.startOf('day').plus({ days: index }))
    return weekDates(cursor)
  }, [view, cursor.toISODate()])

  const displayCalendars = useMemo(() => [
    ...calendars,
    { id: 'tasks', name: '任务', color: '#5f6368', isPrimary: false, isVisible: true }
  ], [calendars])

  const calendarEvents = useMemo<EventInfo[]>(() => [
    ...events,
    ...tasks.filter((task) => task.dueAt).map((task) => {
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
        rrule: null,
        reminders: []
      }
    })
  ], [events, tasks])

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
      setToast('任务请在右侧任务面板中编辑')
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
      setToast('任务请在任务面板中修改截止日期')
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
        username={username}
        avatarColor={avatarColor}
        avatarImage={avatarImage}
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
          />
        ) : view === 'year' ? (
          <YearView anchor={cursor} events={calendarEvents} calendars={displayCalendars} onMonthClick={(month) => { setCursor(month as DateTime<true>); setPreferredView('month') }} />
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
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          calendars={calendars}
          view={view}
          theme={theme}
          onViewChange={setPreferredView}
          onThemeChange={setTheme}
          onCalendarCreate={handleCalendarCreate}
          onCalendarUpdate={handleCalendarUpdate}
          onCalendarDelete={handleCalendarDelete}
          onOpenDataDir={handleOpenDataDir}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onImportIcs={handleImportIcs}
          onOpenRecycleBin={() => setRecycleOpen(true)}
          username={username}
          avatarColor={avatarColor}
          onProfileChange={updateProfile}
          avatarImage={avatarImage}
          onAvatarImageChange={updateAvatarImage}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {helpOpen && <HelpDialog calendars={calendars} onClose={() => setHelpOpen(false)} />}
      {recycleOpen && <RecycleBinDialog onClose={() => setRecycleOpen(false)} onToast={setToast} />}

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
