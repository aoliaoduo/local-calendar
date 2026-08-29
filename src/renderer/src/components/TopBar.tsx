import { useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { getLunarMonthLabel } from '@shared/lunar'
import { api, type AppToastInfo, type CalendarInfo, type EventInfo, type SearchResult } from '../api'
import { fmtEventTime } from '../dateUtils'

export type ViewKind = 'day' | '4day' | 'week' | 'month' | 'year' | 'agenda'

interface TopBarProps {
  view: ViewKind
  title: string
  cursor: DateTime
  calendars: CalendarInfo[]
  onViewChange: (view: ViewKind) => void
  onToggleSidebar: () => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSearchPick: (result: SearchResult) => void
  onToast: (message: string) => void
  onSettings: () => void
  onHelp: () => void
  onPrint: () => void
  onRecycle: () => void
  onAppearance: () => void
  onAvatarClick: () => void
  username: string
  avatarColor: string
  avatarImage: string | null
  notifications: AppToastInfo[]
  onNotificationClick: (notification: AppToastInfo) => void
  onClearNotifications: () => void
  onTransientDismiss?: () => void
}

const VIEW_LABEL: Record<ViewKind, string> = { day: '日', '4day': '4 天', week: '周', month: '月', year: '年', agenda: '日程' }

export default function TopBar({
  view,
  title,
  cursor,
  calendars,
  onViewChange,
  onToggleSidebar,
  onPrev,
  onNext,
  onToday,
  onSearchPick,
  onToast,
  onSettings,
  onHelp,
  onPrint,
  onRecycle,
  onAppearance,
  onAvatarClick,
  username,
  avatarColor,
  avatarImage,
  notifications,
  onNotificationClick,
  onClearNotifications
  ,onTransientDismiss
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [maximized, setMaximized] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const today = DateTime.now()
  const dayNum = today.day
  const calById = new Map(calendars.map((c) => [c.id, c]))

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    void window.calendarApi.windowIsMaximized().then(setMaximized)
    return window.calendarApi.onWindowStateChanged(setMaximized)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      Promise.all([api.searchEvents(q), api.searchTasks(q)])
        .then(([events, tasks]) => setResults([
          ...events.map((item) => ({ kind: 'event' as const, item })),
          ...tasks.map((item) => ({ kind: 'task' as const, item }))
        ].slice(0, 12)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
    setResults([])
  }

  return (
    <header className="topbar" role="banner" onPointerDownCapture={() => { onTransientDismiss?.(); document.dispatchEvent(new Event('calendar-transient-dismiss')) }} onContextMenu={(event) => event.preventDefault()}>
      <div className="window-drag-region" />
      <button className="icon-btn" aria-label="主菜单" title="主菜单" onClick={onToggleSidebar}>
        <span className="material-icons">menu</span>
      </button>
      <div className="logo-block">
        <div className="logo-date">
          <span className="logo-num">{dayNum}</span>
        </div>
        <span className="logo-text">日历</span>
      </div>

      {searchOpen ? (
        <div className="search-bar">
          <span className="material-icons search-icon">search</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索日程（标题、地点、说明）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch()
            }}
          />
          <button className="icon-btn" title="关闭搜索" onClick={closeSearch}>
            <span className="material-icons">close</span>
          </button>
          {query.trim() && (
            <div className="search-panel">
              {results.length === 0 ? (
                <div className="search-empty">没有匹配的日程</div>
              ) : (
                results.map((result, index) => {
                  const evt = result.kind === 'event' ? result.item : null
                  const task = result.kind === 'task' ? result.item : null
                  const color = evt ? evt.colorOverride || calById.get(evt.calendarId)?.color || '#1a73e8' : '#5f6368'
                  const start = evt ? DateTime.fromISO(evt.startUtc) : null
                  const end = evt ? DateTime.fromISO(evt.endUtc) : null
                  return (
                    <button
                      key={`${result.kind}-${evt?.id ?? task?.id}-${index}`}
                      className="search-item"
                      onClick={() => {
                        onSearchPick(result)
                        closeSearch()
                      }}
                    >
                      <span className="bar" style={{ background: color }} />
                      <span className="body">
                        <span className="t"><span className="search-kind">{evt ? '日程' : '任务'}</span>{evt?.title ?? task?.title}</span>
                        <span className="d">
                          {evt && start && end ? fmtEventTime(start, end) : task?.dueAt ? `截止 ${DateTime.fromISO(task.dueAt).toLocal().toFormat('yyyy-MM-dd')}` : '无截止日期'}
                          {' · '}
                          {evt ? calById.get(evt.calendarId)?.name ?? evt.calendarId : '我的任务'}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="topbar-title-group">
          <button className="today-btn" aria-label="回到今天" onClick={onToday}>
            今天
          </button>
          <button className="icon-btn" title="上一页" onClick={onPrev}>
            <span className="material-icons">chevron_left</span>
          </button>
          <button className="icon-btn" title="下一页" onClick={onNext}>
            <span className="material-icons">chevron_right</span>
          </button>
          <div className="title-block">
            <div className="title-main">{title}</div>
            <div className="title-sub">{getLunarMonthLabel(cursor)}</div>
          </div>
        </div>
      )}

      <div className="topbar-right">
        <div className="notification-menu-wrap">
          <button className={`icon-btn${notificationsOpen ? ' active' : ''}`} title="通知" onClick={() => setNotificationsOpen((value) => !value)}>
            <span className="material-icons">notifications</span>
            {notifications.length > 0 && <span className="notification-count">{Math.min(99, notifications.length)}</span>}
          </button>
          {notificationsOpen && (
            <>
              <div className="menu-mask" onClick={() => setNotificationsOpen(false)} />
              <div className="notification-menu">
                <div className="notification-head"><span>通知</span><button className="btn-text compact" onClick={onClearNotifications}>清空</button></div>
                {notifications.length === 0 ? <div className="notification-empty">暂无通知</div> : notifications.map((item, index) => (
                  <button className="notification-item" key={`${item.message}-${index}`} onClick={() => { setNotificationsOpen(false); onNotificationClick(item) }}>
                    <span className="material-icons">{item.kind === 'task' ? 'check_circle' : 'event'}</span><span>{item.message}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          className={`icon-btn${searchOpen ? ' active' : ''}`}
          title="搜索"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          <span className="material-icons">search</span>
        </button>
        <button className="icon-btn" title="使用说明" onClick={onHelp}>
          <span className="material-icons">help_outline</span>
        </button>
        <div className="settings-menu-wrap">
          <button className={`icon-btn${settingsMenuOpen ? ' active' : ''}`} title="设置" onClick={() => setSettingsMenuOpen((value) => !value)}>
            <span className="material-icons">settings</span>
          </button>
          {settingsMenuOpen && (
            <>
              <div className="menu-mask" onClick={() => setSettingsMenuOpen(false)} />
              <div className="settings-menu">
                <button onClick={() => { setSettingsMenuOpen(false); onSettings() }}>设置</button>
                <button onClick={() => { setSettingsMenuOpen(false); onRecycle() }}>回收站</button>
                <div className="settings-menu-divider" />
                <button onClick={() => { setSettingsMenuOpen(false); onAppearance() }}>外观</button>
                <button onClick={() => { setSettingsMenuOpen(false); onPrint() }}>打印</button>
              </div>
            </>
          )}
        </div>

        <div className="view-menu-wrap">
          <button className="view-select" aria-label="视图切换器" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            {VIEW_LABEL[view]}
            <span className="material-icons">arrow_drop_down</span>
          </button>
          {menuOpen && (
            <>
              <div className="menu-mask" onClick={() => setMenuOpen(false)} />
              <div className="view-menu">
                {(['day', '4day', 'week', 'month', 'year', 'agenda'] as const).map((v) => (
                  <button
                    key={v}
                    className={`view-menu-item${view === v ? ' current' : ''}`} role="menuitemradio" aria-checked={view === v}
                    onClick={() => {
                      onViewChange(v)
                      setMenuOpen(false)
                    }}
                  >
                    <span className="material-icons">{v === 'day' ? 'calendar_view_day' : v === '4day' ? 'view_week' : v === 'week' ? 'calendar_view_week' : v === 'month' ? 'calendar_view_month' : v === 'year' ? 'calendar_today' : 'view_agenda'}</span>
                    {VIEW_LABEL[v]}
                    {view === v && <span className="material-icons check">check</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="icon-btn" title="应用信息" onClick={() => onToast('本地日历 · 数据仅保存在此电脑。')}>
          <span className="material-icons">apps</span>
        </button>
        <button className={`avatar${avatarImage ? ' has-image' : ''}`} title="本地账户" style={{ background: avatarImage ? `url(${avatarImage}) center/cover` : avatarColor }} onClick={onAvatarClick}>{avatarImage ? '' : username.trim().slice(0, 1).toUpperCase() || 'A'}</button>
        <div className="window-controls">
          <button className="window-control" title="最小化" onClick={() => window.calendarApi.windowMinimize()}>
            <span className="material-icons">remove</span>
          </button>
          <button className="window-control" title={maximized ? '还原' : '最大化'} onClick={() => window.calendarApi.windowToggleMaximize()}>
            <span className="material-icons">{maximized ? 'filter_none' : 'crop_square'}</span>
          </button>
          <button className="window-control close" title="关闭" onClick={() => window.calendarApi.windowClose()}>
            <span className="material-icons">close</span>
          </button>
        </div>
      </div>
    </header>
  )
}
