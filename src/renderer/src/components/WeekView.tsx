import { useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { getLunarDayLabel } from '@shared/lunar'
import { fmtEventTime, fmtHourLabel, WEEKDAYS_SHORT } from '../dateUtils'
import type { CalendarInfo, EventInfo } from '../api'

interface WeekViewProps {
  dates: DateTime[]
  events: EventInfo[]
  calendars: CalendarInfo[]
  onEventClick: (event: EventInfo) => void
  onSlotClick: (day: DateTime, hour: number) => void
  onDayNumClick: (day: DateTime) => void
  onEventMove: (id: string, start: DateTime, end: DateTime) => void
}

const HOUR_PX = 48
const GRID_H = 24 * HOUR_PX
const SNAP_MIN = 15

interface LaidEvent {
  evt: EventInfo
  lane: number
  lanes: number
}

function layoutLane(events: EventInfo[]): LaidEvent[] {
  const sorted = [...events].sort((a, b) => a.startUtc.localeCompare(b.startUtc))
  const laneEnds: number[] = []
  const out: LaidEvent[] = []
  for (const evt of sorted) {
    const s = DateTime.fromISO(evt.startUtc).toMillis()
    let lane = laneEnds.findIndex((end) => end <= s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = DateTime.fromISO(evt.endUtc).toMillis()
    out.push({ evt, lane, lanes: 1 })
  }
  const total = Math.max(1, laneEnds.length)
  return out.map((e) => ({ ...e, lanes: total }))
}

interface TimedDrag {
  kind: 'move' | 'resize'
  evt: EventInfo
  dayIdx: number
  startMin: number
  endMin: number
}

interface AlldayDrag {
  kind: 'allday'
  evt: EventInfo
  dayIdx: number
  spanDays: number
}

type DragState = TimedDrag | AlldayDrag

function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function indexFromX(x: number, rects: { left: number; right: number }[]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < rects.length; i++) {
    if (x >= rects[i].left && x <= rects[i].right) return i
    const dist = x < rects[i].left ? rects[i].left - x : x - rects[i].right
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function childRects(el: HTMLElement): { left: number; right: number; top: number }[] {
  return Array.from(el.children).map((c) => {
    const r = (c as HTMLElement).getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top }
  })
}

export default function WeekView({
  dates,
  events,
  calendars,
  onEventClick,
  onSlotClick,
  onDayNumClick,
  onEventMove
}: WeekViewProps) {
  const [now, setNow] = useState(() => DateTime.now())
  const [drag, setDrag] = useState<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const alldayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setNow(DateTime.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (scrollRef.current) {
      const nowMinutes = DateTime.now().hour * 60 + DateTime.now().minute
      scrollRef.current.scrollTop = Math.max(0, (nowMinutes / 60) * HOUR_PX - 216)
    }
  }, [])

  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars])
  const cols = dates.length
  const today = DateTime.now()

  const evtsByDay = useMemo(() => {
    const map = new Map<string, { timed: EventInfo[]; allday: EventInfo[] }>()
    for (const d of dates) map.set(d.toISODate()!, { timed: [], allday: [] })
    for (const evt of events) {
      if (!calById.get(evt.calendarId)?.isVisible) continue
      const start = DateTime.fromISO(evt.startUtc)
      const end = DateTime.fromISO(evt.endUtc)
      for (const d of dates) {
        const dayStart = d.startOf('day')
        const dayEnd = dayStart.plus({ days: 1 })
        if (start < dayEnd && end > dayStart) {
          const bucket = map.get(d.toISODate()!)
          if (!bucket) continue
          if (evt.isAllDay || (start <= dayStart && end >= dayEnd)) bucket.allday.push(evt)
          else bucket.timed.push(evt)
        }
      }
    }
    return map
  }, [events, dates, calById])

  function beginTimed(e: React.PointerEvent, evt: EventInfo, dayIdx: number, kind: 'move' | 'resize') {
    if (evt.calendarId === 'holidays' || evt.id.includes('#') || e.button !== 0) return
    const colsEl = colsRef.current
    if (!colsEl) return
    const rects = childRects(colsEl)
    const chipRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const dayStart = dates[dayIdx].startOf('day')
    const dayEnd = dayStart.plus({ days: 1 })
    const origStart = DateTime.fromISO(evt.startUtc)
    const origEnd = DateTime.fromISO(evt.endUtc)
    const durMin = Math.round(origEnd.diff(origStart, 'minutes').minutes)
    const singleDay = origStart >= dayStart && origEnd <= dayEnd && durMin <= 24 * 60
    if (kind === 'resize' && !singleDay) return
    if (kind === 'move' && durMin > 24 * 60) return
    const grabMin =
      kind === 'move' ? clamp(((e.clientY - chipRect.top) / HOUR_PX) * 60, 0, durMin) : 0
    const origStartMin = Math.max(0, Math.round(origStart.diff(dayStart, 'minutes').minutes))
    const startX = e.clientX
    const startY = e.clientY
    const base: TimedDrag = {
      kind,
      evt,
      dayIdx,
      startMin: origStartMin,
      endMin: Math.min(24 * 60, origStartMin + durMin)
    }
    let active = false
    suppressClick.current = false

    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
        active = true
        suppressClick.current = true
      }
      if (kind === 'move') {
        const idx = clamp(indexFromX(ev.clientX, rects), 0, cols - 1)
        const rect = rects[idx]
        const raw = ((ev.clientY - rect.top) / HOUR_PX) * 60 - grabMin
        const startMin = clamp(snap(raw), 0, 24 * 60 - durMin)
        const next: TimedDrag = { ...base, dayIdx: idx, startMin, endMin: startMin + durMin }
        dragRef.current = next
        setDrag(next)
      } else {
        const endMin = clamp(snap(((ev.clientY - rects[dayIdx].top) / HOUR_PX) * 60), origStartMin + SNAP_MIN, 24 * 60)
        const next: TimedDrag = { ...base, endMin }
        dragRef.current = next
        setDrag(next)
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!active || !d || d.kind === 'allday') return
      if (d.kind === 'move') {
        const newStart = dates[d.dayIdx].startOf('day').plus({ minutes: d.startMin })
        onEventMove(evt.id, newStart, newStart.plus({ minutes: durMin }))
      } else if (d.endMin !== base.endMin) {
        const newEnd = dates[dayIdx].startOf('day').plus({ minutes: d.endMin })
        if (newEnd > origStart) onEventMove(evt.id, origStart, newEnd)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function beginAllday(e: React.PointerEvent, evt: EventInfo, dayIdx: number) {
    if (evt.calendarId === 'holidays' || evt.id.includes('#') || e.button !== 0) return
    const cellsEl = alldayRef.current
    if (!cellsEl) return
    const rects = childRects(cellsEl)
    const origStart = DateTime.fromISO(evt.startUtc).startOf('day')
    const origEnd = DateTime.fromISO(evt.endUtc).startOf('day')
    const spanDays = Math.max(1, Math.round(origEnd.diff(origStart, 'days').days) + 1)
    const startX = e.clientX
    let active = false
    let targetIdx = dayIdx
    suppressClick.current = false

    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.abs(ev.clientX - startX) < 4) return
        active = true
        suppressClick.current = true
      }
      const idx = clamp(indexFromX(ev.clientX, rects), 0, cols - 1)
      targetIdx = idx
      const next: AlldayDrag = { kind: 'allday', evt, dayIdx: idx, spanDays }
      dragRef.current = next
      setDrag(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragRef.current = null
      setDrag(null)
      if (!active) return
      const delta = targetIdx - dayIdx
      if (delta !== 0) {
        const s = DateTime.fromISO(evt.startUtc).plus({ days: delta })
        const en = DateTime.fromISO(evt.endUtc).plus({ days: delta })
        onEventMove(evt.id, s, en)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const hourLabels = Array.from({ length: 25 }, (_, h) => h)
  const hasAllday = dates.some((d) => (evtsByDay.get(d.toISODate()!)?.allday.length ?? 0) > 0)
  const nowTop = (now.hour * 60 + now.minute) / 60 * HOUR_PX
  const todayIdx = dates.findIndex((d) => d.hasSame(today, 'day'))

  return (
    <div className={`wk${drag ? ' dragging' : ''}`} style={{ '--cols': cols } as React.CSSProperties}>
      <div className="wk-head">
        <div className="corner">
          <span className="gmt-label">{DateTime.now().toFormat("'GMT'Z")}</span>
        </div>
        {dates.map((d) => {
          const isToday = d.hasSame(today, 'day')
          const lunar = getLunarDayLabel(d)
          return (
            <div key={d.toISODate()} className={`wk-day-head${isToday ? ' is-today' : ''}`}>
              <div className="dow">{WEEKDAYS_SHORT[d.weekday % 7]}</div>
              <div className="dnum" onClick={() => onDayNumClick(d)}>
                {d.day}
              </div>
              <div className={`lunar${lunar.isJieQi ? ' jieqi' : ''}`}>{lunar.text}</div>
            </div>
          )
        })}
      </div>

      {hasAllday && (
        <div className="wk-allday">
          <div className="label">全天</div>
          <div className="allday-cells" ref={alldayRef}>
            {dates.map((d, dayIdx) => {
              const bucket = evtsByDay.get(d.toISODate()!)
              const laid = layoutLane(bucket?.allday ?? [])
              return (
                <div className="cell" key={d.toISODate()}>
                  {laid.map(({ evt, lane, lanes }) => {
                    const color = evt.colorOverride || calById.get(evt.calendarId)?.color || '#1a73e8'
                    return (
                      <div
                        key={evt.id}
                        className={`wk-evt allday${drag?.evt.id === evt.id ? ' drag-source' : ''}`}
                        style={{
                          ['--c' as string]: color,
                          top: 2,
                          height: 24,
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`
                        }}
                        onPointerDown={(e) => beginAllday(e, evt, dayIdx)}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (suppressClick.current) {
                            suppressClick.current = false
                            return
                          }
                          onEventClick(evt)
                        }}
                      >
                        <div className="e-title">
                          {evt.rrule && <span className="material-icons e-repeat">event_repeat</span>}
                          {evt.title}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {drag?.kind === 'allday' && (
              <div
                className="wk-evt allday ghost"
                style={{
                  ['--c' as string]:
                    drag.evt.colorOverride || calById.get(drag.evt.calendarId)?.color || '#1a73e8',
                  top: 2,
                  height: 24,
                  left: `calc(${(drag.dayIdx / cols) * 100}% + 2px)`,
                  width: `calc(${(Math.min(drag.spanDays, cols - drag.dayIdx) / cols) * 100}% - 4px)`
                }}
              >
                <div className="e-title">{drag.evt.title}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="wk-scroll" ref={scrollRef}>
        <div className="wk-grid">
          <div className="wk-times">
            {hourLabels.slice(0, 24).map((h) => (
              <div key={h} className="h-label" style={{ top: h * HOUR_PX + 2 }}>
                {fmtHourLabel(h)}
              </div>
            ))}
          </div>
          <div className="wk-cols" ref={colsRef}>
            {dates.map((d, dayIdx) => {
              const bucket = evtsByDay.get(d.toISODate()!)
              const laid = layoutLane(bucket?.timed ?? [])
              const dayStart = d.startOf('day')
              const dayEnd = dayStart.plus({ days: 1 })
              return (
                <div
                  className="wk-col"
                  key={d.toISODate()}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (suppressClick.current) {
                      suppressClick.current = false
                      return
                    }
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const y = e.clientY - rect.top
                    onSlotClick(d, Math.max(0, Math.min(23, Math.floor(y / HOUR_PX))))
                  }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="wk-hline" style={{ top: h * HOUR_PX }} />
                  ))}
                  {laid.map(({ evt, lane, lanes }) => {
                    const color = evt.colorOverride || calById.get(evt.calendarId)?.color || '#1a73e8'
                    const start = DateTime.fromISO(evt.startUtc)
                    const end = DateTime.fromISO(evt.endUtc)
                    const s = Math.max(0, start.diff(dayStart, 'minutes').minutes)
                    const e = Math.min(24 * 60, end.diff(dayStart, 'minutes').minutes)
                    const top = (s / 60) * HOUR_PX
                    const height = Math.max(14, ((e - s) / 60) * HOUR_PX - 2)
                    const resizable =
                      evt.calendarId !== 'holidays' && start >= dayStart && end <= dayEnd
                    return (
                      <div
                        key={evt.id}
                        className={`wk-evt${drag?.evt.id === evt.id ? ' drag-source' : ''}`}
                        style={{
                          ['--c' as string]: color,
                          top,
                          height,
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`
                        }}
                        onPointerDown={(e2) => beginTimed(e2, evt, dayIdx, 'move')}
                        onClick={(e2) => {
                          e2.stopPropagation()
                          if (suppressClick.current) {
                            suppressClick.current = false
                            return
                          }
                          onEventClick(evt)
                        }}
                      >
                        <div className="e-title">
                          {evt.rrule && <span className="material-icons e-repeat">event_repeat</span>}
                          {evt.title}
                        </div>
                        {height >= 30 && (
                          <div className="e-time">
                            {fmtEventTime(start < dayStart ? dayStart : start, end > dayEnd ? dayEnd : end)}
                          </div>
                        )}
                        {resizable && (
                          <div
                            className="e-resize"
                            onPointerDown={(e2) => {
                              e2.stopPropagation()
                              beginTimed(e2, evt, dayIdx, 'resize')
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                  {drag && drag.kind !== 'allday' && drag.dayIdx === dayIdx && (
                    <div
                      className="wk-evt ghost"
                      style={{
                        ['--c' as string]:
                          drag.evt.colorOverride || calById.get(drag.evt.calendarId)?.color || '#1a73e8',
                        top: (drag.startMin / 60) * HOUR_PX,
                        height: Math.max(14, ((drag.endMin - drag.startMin) / 60) * HOUR_PX - 2),
                        left: 2,
                        right: 2
                      }}
                    >
                      <div className="e-title">{drag.evt.title}</div>
                      <div className="e-time">
                        {dates[dayIdx].startOf('day').plus({ minutes: drag.startMin }).toFormat('HH:mm')} –{' '}
                        {dates[dayIdx].startOf('day').plus({ minutes: drag.endMin }).toFormat('HH:mm')}
                      </div>
                    </div>
                  )}
                  {todayIdx === dayIdx && nowTop < GRID_H && <div className="wk-now" style={{ top: nowTop, left: 0, right: 0 }} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
