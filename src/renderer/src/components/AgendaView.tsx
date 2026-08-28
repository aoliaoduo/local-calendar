import { useMemo } from 'react'
import { DateTime } from 'luxon'
import type { CalendarInfo, EventInfo } from '../api'
import { fmtEventTime } from '../dateUtils'

interface AgendaViewProps {
  anchor: DateTime
  events: EventInfo[]
  calendars: CalendarInfo[]
  onEventClick: (event: EventInfo) => void
}

export default function AgendaView({ anchor, events, calendars, onEventClick }: AgendaViewProps) {
  const colors = new Map(calendars.map((calendar) => [calendar.id, calendar.color]))
  const groups = useMemo(() => {
    const sorted = events.filter((event) => DateTime.fromISO(event.endUtc) >= anchor.startOf('day')).sort((first, second) => first.startUtc.localeCompare(second.startUtc))
    const grouped = new Map<string, EventInfo[]>()
    for (const event of sorted) {
      const date = DateTime.fromISO(event.startUtc).toISODate()!
      if (!grouped.has(date)) grouped.set(date, [])
      grouped.get(date)!.push(event)
    }
    return [...grouped.entries()]
  }, [events, anchor.toISODate()])
  return (
    <div className="agenda-view">
      {groups.length === 0 ? <div className="agenda-empty">当前范围没有日程</div> : groups.map(([date, dayEvents]) => (
        <section className="agenda-group" key={date}>
          <div className="agenda-date">{DateTime.fromISO(date).toFormat('M月d日 EEEE')}</div>
          {dayEvents.map((event) => {
            const start = DateTime.fromISO(event.startUtc)
            const end = DateTime.fromISO(event.endUtc)
            return <button className="agenda-item" key={event.id} onClick={() => onEventClick(event)}>
              <span className="agenda-dot" style={{ background: event.colorOverride || colors.get(event.calendarId) || '#1a73e8' }} />
              <span className="agenda-time">{event.isAllDay ? '全天' : fmtEventTime(start, end)}</span>
              <span className="agenda-title">{event.title}</span>
              {event.location && <span className="agenda-location">{event.location}</span>}
            </button>
          })}
        </section>
      ))}
    </div>
  )
}
