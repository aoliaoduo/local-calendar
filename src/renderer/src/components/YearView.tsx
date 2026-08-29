import { useMemo } from 'react'
import { DateTime } from 'luxon'
import { monthGrid, weekdaysShort } from '../dateUtils'
import type { CalendarInfo, EventInfo } from '../api'

interface YearViewProps {
  anchor: DateTime
  events: EventInfo[]
  calendars: CalendarInfo[]
  onMonthClick: (month: DateTime) => void
  weekStart: 0 | 1
}

export default function YearView({ anchor, events, calendars, onMonthClick, weekStart }: YearViewProps) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => anchor.startOf('year').plus({ months: index })), [anchor.year])
  const visibleCalendars = useMemo(() => new Set(calendars.filter((calendar) => calendar.isVisible).map((calendar) => calendar.id)), [calendars])
  return (
    <div className="year-view">
      {months.map((month) => {
        const days = monthGrid(month, weekStart)
        const eventDays = new Set(events.filter((event) => visibleCalendars.has(event.calendarId)).map((event) => DateTime.fromISO(event.startUtc).toISODate()))
        return (
          <button className="year-month" key={month.toISODate()} onClick={() => onMonthClick(month)}>
            <div className="year-month-title">{month.toFormat('M月')}</div>
            <div className="year-month-dows">{weekdaysShort(weekStart).map((day) => <span key={day}>{day.replace('周', '')}</span>)}</div>
            <div className="year-month-grid">
              {days.map((day) => <span className={`${day.month === month.month ? '' : 'muted'}${eventDays.has(day.toISODate()) ? ' has-event' : ''}`} key={day.toISODate()}>{day.day}</span>)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
