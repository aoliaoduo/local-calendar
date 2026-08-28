import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import { monthGrid, sameDay, WEEKDAYS_SHORT } from '../dateUtils'
import type { CalendarInfo } from '../api'

interface SideBarProps {
  calendars: CalendarInfo[]
  anchor: DateTime
  onAnchorChange: (dt: DateTime) => void
  onCreate: () => void
  onToggleCalendar: (id: string, visible: boolean) => void
  onManageCalendars: () => void
}

export default function SideBar({ calendars, anchor, onAnchorChange, onCreate, onToggleCalendar, onManageCalendars }: SideBarProps) {
  const [miniMonth, setMiniMonth] = useState(() => anchor.startOf('month'))
  const [showMyCals, setShowMyCals] = useState(true)
  const [showOtherCals, setShowOtherCals] = useState(true)
  const days = monthGrid(miniMonth)
  const today = DateTime.now()

  useEffect(() => {
    if (miniMonth.year !== anchor.year || miniMonth.month !== anchor.month) setMiniMonth(anchor.startOf('month'))
  }, [anchor, miniMonth.year, miniMonth.month])

  const myCals = calendars.filter((c) => !['holidays'].includes(c.id))
  const otherCals = calendars.filter((c) => c.id === 'holidays')

  const renderCalRow = (cal: CalendarInfo) => (
    <button
      type="button"
      key={cal.id}
      className={`cal-row${cal.isVisible ? '' : ' off'}`}
      style={{ '--cal-c': cal.color } as React.CSSProperties}
      title={cal.isVisible ? '点击隐藏该日历' : '点击显示该日历'}
      onClick={() => onToggleCalendar(cal.id, !cal.isVisible)}
    >
      <span className="cal-check">
        {cal.isVisible && <span className="material-icons">check</span>}
      </span>
      <span className="cal-name">{cal.name}</span>
    </button>
  )

  return (
    <aside className="sidebar">
      <button className="create-btn" onClick={onCreate}>
        <span className="material-icons">add</span>
        创建
      </button>

      <div className="mini-month">
        <div className="mini-month-head">
          <span className="mm-title">{miniMonth.toFormat('yyyy年M月')}</span>
          <div className="mm-nav">
            <button className="icon-btn" onClick={() => setMiniMonth(miniMonth.minus({ months: 1 }))} title="上个月">
              <span className="material-icons">chevron_left</span>
            </button>
            <button className="icon-btn" onClick={() => setMiniMonth(miniMonth.plus({ months: 1 }))} title="下个月">
              <span className="material-icons">chevron_right</span>
            </button>
          </div>
        </div>
        <div className="mm-grid">
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="mm-dow">
              {d.replace('周', '')}
            </div>
          ))}
          {days.map((d) => {
            const other = d.month !== miniMonth.month
            const isToday = sameDay(d, today)
            const isSelected = sameDay(d, anchor)
            return (
              <button
                type="button"
                key={d.toISODate()}
                className={`mm-day${other ? ' other' : ''}${isToday ? ' today' : ''}${isSelected && !isToday ? ' selected' : ''}`}
                onClick={() => onAnchorChange(d)}
              >
                {d.day}
              </button>
            )
          })}
        </div>
      </div>

      <div className="side-group-title-row">
        <span className="side-group-title">我的日历</span>
        <div className="side-group-actions">
          <button className="icon-btn small" title="添加日历" onClick={onManageCalendars}>
            <span className="material-icons">add</span>
          </button>
          <button className="icon-btn small" title="展开/折叠" onClick={() => setShowMyCals((v) => !v)}>
            <span className="material-icons">{showMyCals ? 'expand_less' : 'expand_more'}</span>
          </button>
        </div>
      </div>
      {showMyCals && myCals.map(renderCalRow)}

      <div className="side-group-title-row">
        <span className="side-group-title">其他日历</span>
        <button className="icon-btn small" title="展开/折叠" onClick={() => setShowOtherCals((v) => !v)}>
          <span className="material-icons">{showOtherCals ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>
      {showOtherCals && otherCals.map(renderCalRow)}
    </aside>
  )
}
