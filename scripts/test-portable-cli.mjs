import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const dataDir = mkdtempSync(join(tmpdir(), 'local-calendar-portable-cli-test-'))
const electron = resolve('node_modules/electron/dist/electron.exe')
const cli = resolve('out/main/cli.js')

try {
  const result = spawnSync(electron, [cli, '--data-dir', dataDir, 'doctor', '--json'], {
    cwd: resolve('.'),
    env: { ...process.env, APPDATA: join(dataDir, 'legacy-empty'), ELECTRON_RUN_AS_NODE: '1', LOCAL_CALENDAR_CLI_LOCAL: '1' },
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(resolve(report.dataDir), resolve(dataDir))
  assert.equal(report.databaseExists, true)
  assert.equal(report.appRunning, false)
} finally {
  rmSync(dataDir, { recursive: true, force: true })
}

console.log('portable CLI runner smoke test passed')
