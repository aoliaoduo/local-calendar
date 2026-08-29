import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const dataDir = mkdtempSync(join(tmpdir(), 'local-calendar-cli-test-'))
const cli = resolve('out/main/cli.js')
const environment = {
  ...process.env,
  APPDATA: join(dataDir, 'legacy-empty'),
  LOCAL_CALENDAR_DATA_DIR: dataDir,
  LOCAL_CALENDAR_CLI_LOCAL: '1'
}

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: resolve('.'),
    env: environment,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(`localcal ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function runJson(...args) {
  return JSON.parse(run('--json', ...args))
}

try {
  assert.match(run('--help'), /本地日历 CLI/)
  assert.match(run('-h'), /用法: localcal/)

  const event = runJson('create', 'CLI', 'smoke', '-s', '2026-09-10T09:00', '-e', '2026-09-10T10:00', '-c', 'work', '--remind', '10')
  assert.equal(event.title, 'CLI smoke')
  assert.equal(event.calendarId, 'work')
  assert.equal(event.reminders[0].minutes, 10)

  const events = runJson('list', '-f', '2026-09-10', '-t', '2026-09-10')
  assert.equal(events.some((item) => item.id === event.id), true)

  const fixture = join(dataDir, 'import.ics')
  writeFileSync(fixture, String.raw`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Imported\, event
DTSTART:20260912T090000Z
DTEND:20260912T100000Z
END:VEVENT
END:VCALENDAR`)
  const imported = runJson('import', '-i', fixture)
  assert.equal(imported.count, 1)
  const importedEvents = runJson('list', '-f', '2026-09-12', '-t', '2026-09-12')
  assert.equal(importedEvents.some((item) => item.title === 'Imported, event'), true)

  const parentTask = runJson('task', 'add', 'CLI', 'parent')
  const task = runJson('task', 'add', 'CLI', 'task', '-d', '2026-09-11', '-p', 'high', '-r', 'weekly', '--remind', '30', '--parent', parentTask.id)
  assert.equal(task.title, 'CLI task')
  assert.equal(task.parentId, parentTask.id)
  assert.equal(task.priority, 1)
  assert.equal(task.reminderMinutes, 30)
  assert.equal(task.rrule, 'WEEKLY')

  const tasks = runJson('task', 'list', '--all')
  assert.equal(tasks.some((item) => item.id === task.id), true)

  const report = runJson('doctor')
  assert.equal(resolve(report.dataDir), resolve(dataDir))
  assert.equal(report.databaseExists, true)
  assert.equal(report.appRunning, false)

  const alternateDataDir = join(dataDir, 'second-portable', 'data')
  const alternateReport = runJson('--data-dir', alternateDataDir, 'doctor')
  assert.equal(resolve(alternateReport.dataDir), resolve(alternateDataDir))
  assert.equal(alternateReport.dataSource, '--data-dir')
} finally {
  rmSync(dataDir, { recursive: true, force: true })
}

console.log('CLI smoke tests passed')
