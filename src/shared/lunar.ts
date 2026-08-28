import { Solar } from 'lunar-javascript'
import { DateTime } from 'luxon'

export interface LunarDayLabel {
  text: string
  isJieQi: boolean
  isToday: boolean
}

function toSolar(dt: DateTime) {
  return Solar.fromYmd(dt.year, dt.month, dt.day)
}

// 日期头标签：节气(绿) > 节日(绿) > 农历日名；初一显示月名
export function getLunarDayLabel(dt: DateTime): LunarDayLabel {
  const lunar = toSolar(dt).getLunar()
  const jieQi = lunar.getJieQi()
  if (jieQi) return { text: jieQi, isJieQi: true, isToday: false }
  const festivals = lunar.getFestivals()
  if (festivals.length > 0) return { text: festivals[0], isJieQi: true, isToday: false }
  if (lunar.getDay() === 1) return { text: `${lunar.getMonthInChinese()}月`, isJieQi: false, isToday: false }
  return { text: lunar.getDayInChinese(), isJieQi: false, isToday: false }
}

export function getLunarMonthLabel(dt: DateTime): string {
  const lunar = toSolar(dt).getLunar()
  return `农历${lunar.getMonthInChinese()}月`
}

export interface HolidayItem {
  date: string
  name: string
}

const SOLAR_FESTIVALS: Record<string, string> = {
  '1-1': '元旦',
  '5-1': '劳动节',
  '10-1': '国庆节'
}

export function getHolidays(from: DateTime, to: DateTime): HolidayItem[] {
  const out: HolidayItem[] = []
  for (let d = from.startOf('day'); d <= to; d = d.plus({ days: 1 })) {
    const lunar = toSolar(d).getLunar()
    const lunarFests = lunar.getFestivals()
    if (lunarFests.length > 0) {
      out.push({ date: d.toISODate()!, name: lunarFests[0] })
      continue
    }
    const jieQi = lunar.getJieQi()
    if (jieQi === '清明') {
      out.push({ date: d.toISODate()!, name: '清明节' })
      continue
    }
    const solarKey = `${d.month}-${d.day}`
    if (SOLAR_FESTIVALS[solarKey]) out.push({ date: d.toISODate()!, name: SOLAR_FESTIVALS[solarKey] })
  }
  return out
}

export const HOLIDAY_CALENDAR_ID = 'holidays'
