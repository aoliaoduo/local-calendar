import { DateTime } from 'luxon'
import type { CalendarInfo, EventInfo } from '../api'
import { fmtEventTime } from '../dateUtils'

interface DayAgendaDialogProps {
  day: DateTime
  events: EventInfo[]
  calendars: CalendarInfo[]
  onClose: () => void
  onEventClick: (event: EventInfo) => void
}

export default function DayAgendaDialog({ day, events, calendars, onClose, onEventClick }: DayAgendaDialogProps) {
  const colors = new Map(calendars.map((calendar) => [calendar.id, calendar.color]))
  const dayStart = day.startOf('day')
  const dayEnd = dayStart.plus({ days: 1 })
  const dayEvents = events
    .filter((event) => DateTime.fromISO(event.startUtc) < dayEnd && DateTime.fromISO(event.endUtc) > dayStart)
    .sort((first, second) => first.startUtc.localeCompare(second.startUtc))

  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="day-agenda-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="day-agenda-head">
          <div>
            <div className="day-agenda-title">{day.toFormat('M月d日 EEEE')}</div>
            <div className="day-agenda-sub">{dayEvents.length ? `${dayEvents.length} 项日程` : '暂无日程'}</div>
          </div>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div className="day-agenda-list">
          {dayEvents.length === 0 ? (
            <div className="day-agenda-empty">这一天还没有安排</div>
          ) : dayEvents.map((event) => {
            const start = DateTime.fromISO(event.startUtc)
            const end = DateTime.fromISO(event.endUtc)
            const color = event.colorOverride || colors.get(event.calendarId) || '#1a73e8'
            return (
              <button className="day-agenda-item" key={event.id} onClick={() => { onEventClick(event); onClose() }}>
                <span className="day-agenda-dot" style={{ background: color }} />
                <span className="day-agenda-item-body">
                  <span className="day-agenda-item-title">{event.title}</span>
                  <span className="day-agenda-item-time">{event.isAllDay ? '全天' : fmtEventTime(start, end)}</span>
                  {event.location && <span className="day-agenda-item-location">{event.location}</span>}
                </span>
                <span className="material-icons day-agenda-arrow">chevron_right</span>
              </button>
            )
          })}
        </div>
        <div className="day-agenda-foot">
          <button className="btn-text" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
