import { DateTime } from 'luxon'
import type { CreateEventInput } from './types'

interface ParsedDate {
  value: string
  allDay: boolean
}

function parseDate(value: string): ParsedDate | null {
  const clean = value.trim()
  if (/^\d{8}$/.test(clean)) {
    const date = DateTime.fromFormat(clean, 'yyyyMMdd')
    return date.isValid ? { value: date.toFormat('yyyy-MM-dd'), allDay: true } : null
  }
  const date = DateTime.fromFormat(clean.replace(/Z$/, ''), "yyyyMMdd'T'HHmmss", { zone: clean.endsWith('Z') ? 'utc' : 'local' })
  return date.isValid ? { value: date.toISO()!, allDay: false } : null
}

function unescapeValue(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1')
}

function unfold(content: string): string[] {
  const lines: string[] = []
  for (const line of content.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1)
    else lines.push(line)
  }
  return lines
}

/** Parses the event subset of RFC 5545 used by Local Calendar imports. */
export function parseIcsEvents(content: string): CreateEventInput[] {
  const events: CreateEventInput[] = []
  let fields: Record<string, string> | null = null

  for (const line of unfold(content)) {
    if (line === 'BEGIN:VEVENT') {
      fields = {}
      continue
    }
    if (line === 'END:VEVENT' && fields) {
      const start = fields.DTSTART ? parseDate(fields.DTSTART) : null
      const end = fields.DTEND ? parseDate(fields.DTEND) : null
      if (start && fields.SUMMARY) {
        events.push({
          title: unescapeValue(fields.SUMMARY),
          description: fields.DESCRIPTION ? unescapeValue(fields.DESCRIPTION) : undefined,
          location: fields.LOCATION ? unescapeValue(fields.LOCATION) : undefined,
          start: start.value,
          end: end?.value ?? (start.allDay ? DateTime.fromISO(start.value).plus({ days: 1 }).toFormat('yyyy-MM-dd') : DateTime.fromISO(start.value).plus({ hours: 1 }).toISO()!),
          isAllDay: start.allDay,
          rrule: fields.RRULE || undefined
        })
      }
      fields = null
      continue
    }
    if (fields) {
      const separator = line.indexOf(':')
      if (separator > 0) fields[line.slice(0, separator).split(';')[0].toUpperCase()] = line.slice(separator + 1)
    }
  }
  return events
}
