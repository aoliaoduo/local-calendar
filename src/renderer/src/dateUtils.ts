import { DateTime } from 'luxon'

export const WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// Google Calendar 默认一周从周日开始
export function startOfWeek(dt: DateTime): DateTime {
  return dt.startOf('week', { useLocaleWeeks: false }).minus({ days: 1 }).startOf('day')
}

export function weekDates(anchor: DateTime): DateTime[] {
  const start = anchor.startOf('day').minus({ days: anchor.weekday % 7 })
  return Array.from({ length: 7 }, (_, i) => start.plus({ days: i }))
}

export function monthGrid(anchor: DateTime): DateTime[] {
  const first = anchor.startOf('month').startOf('day')
  const start = first.minus({ days: first.weekday % 7 })
  return Array.from({ length: 42 }, (_, i) => start.plus({ days: i }))
}

export function sameDay(a: DateTime, b: DateTime): boolean {
  return a.hasSame(b, 'day')
}

export function fmtHourLabel(hour: number): string {
  if (hour === 0) return '上午12点'
  if (hour < 12) return `上午${hour}点`
  if (hour === 12) return '下午12点'
  return `下午${hour - 12}点`
}

export function fmtEventTime(start: DateTime, end: DateTime): string {
  const s = start.toFormat('HH:mm')
  const e = end.toFormat('HH:mm')
  return s === '00:00' && e === '23:59' ? '全天' : `${s} – ${e}`
}

export function fmtRangeTitle(dates: DateTime[], view: 'day' | 'week' | 'month'): string {
  if (view === 'day') return dates[0].toFormat('yyyy年M月d日 EEEE')
  if (view === 'month') return dates[0].toFormat('yyyy年M月')
  const a = dates[0]
  const b = dates[6]
  if (a.month === b.month && a.year === b.year) {
    return `${a.toFormat('yyyy年M月d日')} – ${b.toFormat('d日')}`
  }
  if (a.year === b.year) {
    return `${a.toFormat('M月d日')} – ${b.toFormat('M月d日')}`
  }
  return `${a.toFormat('yyyy年M月d日')} – ${b.toFormat('yyyy年M月d日')}`
}
