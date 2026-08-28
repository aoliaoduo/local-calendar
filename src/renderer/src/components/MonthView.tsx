import { useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { getLunarDayLabel } from '@shared/lunar'
import { monthGrid, WEEKDAYS_SHORT } from '../dateUtils'
import type { CalendarInfo, EventInfo } from '../api'

interface MonthViewProps {
  anchor: DateTime
  events: EventInfo[]
  calendars: CalendarInfo[]
  onEventClick: (event: EventInfo) => void
  onDayClick: (day: DateTime) => void
  onEventMove: (id: string, start: DateTime, end: DateTime) => void
}

export default function MonthView({ anchor, events, calendars, onEventClick, onDayClick, onEventMove }: MonthViewProps) {
  const days = useMemo(() => monthGrid(anchor), [anchor.toISODate()])
  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const today = DateTime.now()
  const gridRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<{ evt: EventInfo; date: DateTime } | null>(null)

  const evtsByDay = useMemo(() => {
    const map = new Map<string, EventInfo[]>()
    for (const evt of events) {
      if (!calById.get(evt.calendarId)?.isVisible) continue
      const start = DateTime.fromISO(evt.startUtc).startOf('day')
      const end = DateTime.fromISO(evt.endUtc).startOf('day')
      for (let d = start; d <= end; d = d.plus({ days: 1 })) {
        const key = d.toISODate()!
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(evt)
      }
    }
    return map
  }, [events, calById])

  function beginDrag(e: React.PointerEvent, evt: EventInfo, origDate: DateTime) {
    if (evt.calendarId === 'holidays' || evt.id.includes('#') || e.button !== 0) return
    const grid = gridRef.current
    if (!grid) return
    const rects = Array.from(grid.children).map((c) => (c as HTMLElement).getBoundingClientRect())
    const startX = e.clientX
    const startY = e.clientY
    let active = false
    let target: DateTime | null = null
    suppressClick.current = false

    const idxFromPoint = (x: number, y: number): number => {
      let best = -1
      let bestDist = Infinity
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
        const cx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
        const cy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
        const dist = Math.hypot(cx, cy)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
      return best
    }

    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
        active = true
        suppressClick.current = true
      }
      const idx = idxFromPoint(ev.clientX, ev.clientY)
      if (idx >= 0) {
        target = days[idx]
        setDrag({ evt, date: days[idx] })
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDrag(null)
      if (!active || !target) return
      const delta = target.startOf('day').diff(origDate.startOf('day'), 'days').days
      if (delta === 0) return
      onEventMove(
        evt.id,
        DateTime.fromISO(evt.startUtc).plus({ days: delta }),
        DateTime.fromISO(evt.endUtc).plus({ days: delta })
      )
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="mo">
      <div className="mo-head">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
      </div>
      <div className="mo-grid" ref={gridRef}>
        {days.map((d) => {
          const other = d.month !== anchor.month
          const isToday = d.hasSame(today, 'day')
          const dayEvents = evtsByDay.get(d.toISODate()!) ?? []
          const lunar = getLunarDayLabel(d)
          const visible = Math.max(0, 3 - (isToday ? 1 : 0))
          const shown = dayEvents.slice(0, visible)
          const more = dayEvents.length - shown.length
          const isDrop = drag?.date.hasSame(d, 'day') === true
          return (
            <div
              key={d.toISODate()}
              className={`mo-cell${other ? ' other' : ''}${isToday ? ' today' : ''}${isDrop ? ' drop-target' : ''}`}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                onDayClick(d)
              }}
            >
              <div className="dnum-row">
                <div className="dnum">{d.day}</div>
                <span className={`mo-lunar${lunar.isJieQi ? ' jieqi' : ''}${isToday ? ' today' : ''}`}>{lunar.text}</span>
              </div>
              {isToday && <div className="mo-today-label">今天</div>}
              {shown.map((evt) => {
                const color = evt.colorOverride || calById.get(evt.calendarId)?.color || '#1a73e8'
                return (
                  <div
                    key={evt.id}
                    className={`mo-evt${drag?.evt.id === evt.id ? ' drag-source' : ''}`}
                    style={{ ['--c' as string]: color }}
                    onPointerDown={(e) => beginDrag(e, evt, d)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (suppressClick.current) {
                        suppressClick.current = false
                        return
                      }
                      onEventClick(evt)
                    }}
                  >
                    <span className="dot" />
                    <span className="t">{evt.title}</span>
                  </div>
                )
              })}
              {more > 0 && (
                <div
                  className="mo-more"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDayClick(d)
                  }}
                >
                  还有 {more} 项
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
