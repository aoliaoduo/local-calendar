import { useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { getLunarMonthLabel } from '@shared/lunar'
import { api, type CalendarInfo, type EventInfo } from '../api'
import { fmtEventTime } from '../dateUtils'

export type ViewKind = 'day' | 'week' | 'month'

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
  tasksOpen: boolean
  onToggleTasks: () => void
  onSearchPick: (event: EventInfo) => void
  onToast: (message: string) => void
  onSettings: () => void
}

const VIEW_LABEL: Record<ViewKind, string> = { day: '日', week: '周', month: '月' }

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
  tasksOpen,
  onToggleTasks,
  onSearchPick,
  onToast,
  onSettings
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventInfo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const today = DateTime.now()
  const dayNum = today.day
  const calById = new Map(calendars.map((c) => [c.id, c]))

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      api
        .searchEvents(q)
        .then((r) => setResults(r.slice(0, 10)))
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
    <header className="topbar">
      <div className="window-drag-region" />
      <button className="icon-btn" title="主菜单" onClick={onToggleSidebar}>
        <span className="material-icons">menu</span>
      </button>
      <div className="logo-block">
        <div className="logo-date">
          <span className="logo-dow">{['日', '一', '二', '三', '四', '五', '六'][today.weekday % 7]}</span>
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
                results.map((evt) => {
                  const color = evt.colorOverride || calById.get(evt.calendarId)?.color || '#1a73e8'
                  const start = DateTime.fromISO(evt.startUtc)
                  const end = DateTime.fromISO(evt.endUtc)
                  return (
                    <button
                      key={evt.id}
                      className="search-item"
                      onClick={() => {
                        onSearchPick(evt)
                        closeSearch()
                      }}
                    >
                      <span className="bar" style={{ background: color }} />
                      <span className="body">
                        <span className="t">{evt.title}</span>
                        <span className="d">
                          {fmtEventTime(start, end)}
                          {' · '}
                          {calById.get(evt.calendarId)?.name ?? evt.calendarId}
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
          <button className="today-btn" onClick={onToday}>
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
        <button
          className={`icon-btn${searchOpen ? ' active' : ''}`}
          title="搜索"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          <span className="material-icons">search</span>
        </button>
        <button className="icon-btn" title="使用说明" onClick={() => onToast('快捷键：T 回到今天；1/2/3 切换日/周/月视图。')}>
          <span className="material-icons">help_outline</span>
        </button>
        <button className="icon-btn" title="设置" onClick={onSettings}>
          <span className="material-icons">settings</span>
        </button>

        <div className="view-menu-wrap">
          <button className="view-select" onClick={() => setMenuOpen((v) => !v)}>
            {VIEW_LABEL[view]}
            <span className="material-icons">arrow_drop_down</span>
          </button>
          {menuOpen && (
            <>
              <div className="menu-mask" onClick={() => setMenuOpen(false)} />
              <div className="view-menu">
                {(['day', 'week', 'month'] as const).map((v) => (
                  <button
                    key={v}
                    className={`view-menu-item${view === v ? ' current' : ''}`}
                    onClick={() => {
                      onViewChange(v)
                      setMenuOpen(false)
                    }}
                  >
                    <span className="material-icons">{v === 'day' ? 'calendar_view_day' : v === 'week' ? 'calendar_view_week' : 'calendar_view_month'}</span>
                    {VIEW_LABEL[v]}
                    {view === v && <span className="material-icons check">check</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="seg-control">
          <button
            className={`seg-btn${!tasksOpen ? ' active' : ''}`}
            title="日历视图"
            onClick={() => tasksOpen && onToggleTasks()}
          >
            <span className="material-icons">calendar_month</span>
          </button>
          <button
            className={`seg-btn${tasksOpen ? ' active' : ''}`}
            title="任务"
            onClick={onToggleTasks}
          >
            <span className="material-icons">check</span>
          </button>
        </div>

        <button className="upgrade-btn" onClick={() => onToast('本地版日历的全部功能均可免费使用。')}>升级</button>
        <button className="icon-btn" title="应用信息" onClick={() => onToast('本地日历 · 数据仅保存在此电脑。')}>
          <span className="material-icons">apps</span>
        </button>
        <button className="avatar" title="本地账户" onClick={() => onToast('当前使用本地账户，未连接任何云服务。')}>A</button>
        <div className="window-controls">
          <button className="window-control" title="最小化" onClick={() => window.calendarApi.windowMinimize()}>
            <span className="material-icons">remove</span>
          </button>
          <button className="window-control" title="最大化" onClick={() => window.calendarApi.windowToggleMaximize()}>
            <span className="material-icons">crop_square</span>
          </button>
          <button className="window-control close" title="关闭" onClick={() => window.calendarApi.windowClose()}>
            <span className="material-icons">close</span>
          </button>
        </div>
      </div>
    </header>
  )
}
