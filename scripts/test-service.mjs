import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DateTime } from 'luxon'
import { isReminderDue } from '../src/shared/reminders.ts'
import { parseIcsEvents } from '../src/shared/ics.ts'

const parsedIcs = parseIcsEvents(String.raw`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Planning\, review\; Q3
DESCRIPTION:First line\nsecond line
 continued
LOCATION:Room\, A
DTSTART:20260910T090000Z
DTEND:20260910T100000Z
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
SUMMARY:All-day planning
DTSTART;VALUE=DATE:20260911
END:VEVENT
END:VCALENDAR`)
assert.equal(parsedIcs.length, 2)
assert.equal(parsedIcs[0].title, 'Planning, review; Q3')
assert.equal(parsedIcs[0].description, 'First line\nsecond linecontinued')
assert.equal(parsedIcs[0].location, 'Room, A')
assert.equal(parsedIcs[0].start, '2026-09-10T09:00:00.000Z')
assert.equal(parsedIcs[0].rrule, 'FREQ=WEEKLY')
assert.equal(parsedIcs[1].isAllDay, true)
assert.equal(parsedIcs[1].end, '2026-09-12')

const dataDir = mkdtempSync(join(tmpdir(), 'local-calendar-test-'))
process.env.LOCAL_CALENDAR_DATA_DIR = dataDir
process.env.APPDATA = join(dataDir, 'legacy-empty')

let service
for (const chunk of readdirSync(resolve('out/main/chunks')).filter((name) => name.endsWith('.js'))) {
  const candidate = await import(pathToFileURL(resolve('out/main/chunks', chunk)).href)
  if (candidate.CalendarService || candidate.C) {
    service = candidate
    break
  }
}
assert.ok(service, 'built service module not found')
const CalendarService = service.CalendarService ?? service.C
const openDatabase = service.openDatabase ?? service.o
const getDataDir = service.getDataDir ?? service.a
assert.ok(CalendarService && openDatabase, 'service exports not found')
assert.equal(resolve(getDataDir()), resolve(dataDir))
const appDataRoot = join(dataDir, 'appdata')
const legacyDir = join(appDataRoot, 'local-calendar')
const migratedDir = join(dataDir, 'migrated-target')
mkdirSync(legacyDir, { recursive: true })
writeFileSync(join(legacyDir, 'calendar.db'), 'legacy-db')
process.env.APPDATA = appDataRoot
process.env.LOCAL_CALENDAR_DATA_DIR = migratedDir
assert.equal(resolve(getDataDir()), resolve(migratedDir))
assert.equal(readFileSync(join(migratedDir, 'calendar.db'), 'utf8'), 'legacy-db')
delete process.env.LOCAL_CALENDAR_DATA_DIR
process.env.PORTABLE_EXECUTABLE_DIR = join(dataDir, 'portable-app')
assert.equal(resolve(getDataDir()), resolve(join(dataDir, 'portable-app', 'data')))
delete process.env.PORTABLE_EXECUTABLE_DIR
process.env.LOCAL_CALENDAR_PACKAGE_DIR = join(dataDir, 'package-app')
assert.equal(resolve(getDataDir()), resolve(join(dataDir, 'package-app', 'data')))
delete process.env.LOCAL_CALENDAR_PACKAGE_DIR
process.env.LOCAL_CALENDAR_DATA_DIR = dataDir
process.env.APPDATA = join(dataDir, 'legacy-empty')
const reminderBase = DateTime.fromISO('2026-08-29T10:00')
assert.equal(isReminderDue(reminderBase, reminderBase), true)
assert.equal(isReminderDue(reminderBase.plus({ seconds: 59 }), reminderBase), true)
assert.equal(isReminderDue(reminderBase.plus({ seconds: 60 }), reminderBase), false)
assert.equal(isReminderDue(reminderBase.minus({ seconds: 1 }), reminderBase), false)
const calendar = new CalendarService(openDatabase())

const reminderEvent = calendar.createEvent({ title: 'reminder', calendarId: 'personal', start: '2026-08-29T10:00', end: '2026-08-29T11:00', reminders: [{ minutes: 10, method: 'popup' }] })
assert.equal(calendar.getEvent(reminderEvent.id)?.reminders[0]?.minutes, 10)
calendar.deleteEvent(reminderEvent.id)
assert.equal(calendar.listTrash().some((item) => item.kind === 'event' && item.title === 'reminder'), true)
const deletedEvent = calendar.listTrash().find((item) => item.kind === 'event' && item.title === 'reminder')
assert.ok(deletedEvent)
calendar.restoreTrash(deletedEvent.id)
assert.equal(calendar.getEvent(reminderEvent.id)?.title, 'reminder')

const recurring = calendar.createTask({ title: 'repeat', dueAt: '2026-08-29', rrule: 'DAILY' })
assert.equal(recurring.reminderMinutes, 900)
assert.equal(calendar.createTask({ title: 'no due' }).reminderMinutes, null)
assert.throws(() => calendar.createTask({ title: 'bad due', dueAt: 'not-a-date' }))
assert.throws(() => calendar.createEvent({ title: 'bad calendar', calendarId: 'missing', start: '2026-08-29T10:00', end: '2026-08-29T11:00' }))
assert.throws(() => calendar.createEvent({ title: 'bad end', start: '2026-08-29T10:00', end: 'not-a-date' }))
const occurrences = calendar.listTaskOccurrences('2026-08-29', '2026-09-01')
assert.equal(occurrences.filter((task) => task.id.startsWith(`${recurring.id}#`)).length, 4)
calendar.deleteTaskOccurrence(recurring.id, 1)
assert.equal(calendar.listTaskOccurrences('2026-08-29', '2026-09-01').some((task) => task.id === `${recurring.id}#1`), false)
const standalone = calendar.updateTaskOccurrence(recurring.id, 0, { title: 'single instance' })
assert.equal(standalone.title, 'single instance')
assert.equal(standalone.rrule, null)

const first = calendar.createTask({ title: 'first' })
const second = calendar.createTask({ title: 'second' })
calendar.reorderTasks([second.id, first.id])
assert.equal(calendar.listTasks({ status: 'all' }).find((task) => task.id === second.id)?.sortOrder < calendar.listTasks({ status: 'all' }).find((task) => task.id === first.id)?.sortOrder, true)

calendar.db.close()
rmSync(dataDir, { recursive: true, force: true })
console.log('service smoke tests passed')
