import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DateTime } from 'luxon'
import { isReminderDue } from '../src/shared/reminders.ts'

const dataDir = mkdtempSync(join(tmpdir(), 'local-calendar-test-'))
process.env.LOCAL_CALENDAR_DATA_DIR = dataDir
process.env.APPDATA = join(dataDir, 'legacy-empty')

const chunk = readdirSync(resolve('out/main/chunks')).find((name) => name.startsWith('rpc-methods-') && name.endsWith('.js'))
assert.ok(chunk, 'built service chunk not found')
const service = await import(pathToFileURL(resolve('out/main/chunks', chunk)).href)
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
