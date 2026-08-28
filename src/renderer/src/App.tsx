import { useCallback, useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import TopBar, { type ViewKind } from './components/TopBar'
import SideBar from './components/SideBar'
import WeekView from './components/WeekView'
import MonthView from './components/MonthView'
import EventDialog, { type DialogState } from './components/EventDialog'
import TasksPanel from './components/TasksPanel'
import SettingsDialog from './components/SettingsDialog'
import { api, type CalendarInfo, type EventInfo } from './api'
import { weekDates } from './dateUtils'

export default function App() {
  const [view, setView] = useState<ViewKind>(() => (localStorage.getItem('local-calendar.default-view') as ViewKind) || 'week')
  const [cursor, setCursor] = useState(() => DateTime.now())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [events, setEvents] = useState<EventInfo[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('local-calendar.theme') as 'light' | 'dark') || 'light')

  const loadCalendars = useCallback(async () => {
    setCalendars(await api.listCalendars())
  }, [])

  const loadEvents = useCallback(async () => {
    const from = cursor.startOf('month').minus({ days: 7 }).toFormat('yyyy-MM-dd')
    const to = cursor.endOf('month').plus({ days: 7 }).toFormat('yyyy-MM-dd')
    setEvents(await api.listEvents(from, to))
  }, [cursor])

  useEffect(() => {
    void loadCalendars()
  }, [loadCalendars])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

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
    })
    return off
  }, [loadCalendars, loadEvents])

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

  const dates = useMemo(() => {
    if (view === 'day') return [cursor.startOf('day')]
    return weekDates(cursor)
  }, [view, cursor.toISODate()])

  const title = useMemo(() => {
    if (view === 'month' || view === 'week') {
      const weekStart = view === 'week' ? dates[0] : cursor.startOf('month')
      const weekEnd = view === 'week' ? dates[6] : cursor.endOf('month')
      if (weekStart.year === weekEnd.year && weekStart.month === weekEnd.month) {
        return weekStart.toFormat('yyyy年M月')
      }
      if (weekStart.year === weekEnd.year) {
        return `${weekStart.toFormat('M月')} – ${weekEnd.toFormat('M月')}`
      }
      return `${weekStart.toFormat('yyyy年M月')} – ${weekEnd.toFormat('yyyy年M月')}`
    }
    return cursor.toFormat('M月d日 EEEE')
  }, [view, dates, cursor.toISODate()])

  const step = (dir: 1 | -1) => {
    if (view === 'day') setCursor(cursor.plus({ days: dir }))
    else if (view === 'week') setCursor(cursor.plus({ weeks: dir }))
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
    if (evt.calendarId === 'holidays') {
      setToast('节假日为内置只读日历')
      return
    }
    const baseId = evt.id.includes('#') ? evt.id.split('#')[0] : evt.id
    setDialog({ mode: 'edit', event: baseId === evt.id ? evt : { ...evt, id: baseId } })
  }

  const handleEventMove = async (id: string, start: DateTime, end: DateTime) => {
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
        onSearchPick={(evt) => {
          setCursor(DateTime.fromISO(evt.startUtc) as DateTime<true>)
          setView('day')
          openEvent(evt)
        }}
      />

      {sidebarOpen && (
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
          onManageCalendars={() => setSettingsOpen(true)}
        />
      )}

      <main className={`content${tasksOpen ? ' with-tasks' : ''}${sidebarOpen ? '' : ' no-sidebar'}`}>
        {view === 'month' ? (
          <MonthView
            anchor={cursor}
            events={events}
            calendars={calendars}
            onEventClick={openEvent}
            onDayClick={(d) => setDialog({ mode: 'create', day: d, allDay: true })}
            onEventMove={handleEventMove}
          />
        ) : (
          <WeekView
            dates={dates}
            events={events}
            calendars={calendars}
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
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
