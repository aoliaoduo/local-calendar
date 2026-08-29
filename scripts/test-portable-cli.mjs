import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const dataDir = mkdtempSync(join(tmpdir(), 'local-calendar-portable-cli-test-'))
const electron = resolve('node_modules/electron/dist/electron.exe')
const cli = resolve('out/main/cli.js')
assert.equal(existsSync(electron), true, `Electron binary is missing: ${electron}`)
assert.equal(existsSync(cli), true, `Built CLI is missing: ${cli}`)

function runPortableCli(dataDir, extraArgs = []) {
  return spawnSync(electron, [...extraArgs, cli, '--data-dir', dataDir, 'doctor', '--json'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      APPDATA: join(dataDir, 'legacy-empty'),
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      LOCAL_CALENDAR_CLI_LOCAL: '1'
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000
  })
}

try {
  let result = runPortableCli(dataDir)
  if (result.status !== 0) result = runPortableCli(dataDir, ['--disable-gpu', '--no-sandbox'])
  assert.equal(result.status, 0, JSON.stringify({ error: result.error?.message, signal: result.signal, stdout: result.stdout, stderr: result.stderr }, null, 2))
  const report = JSON.parse(result.stdout)
  assert.equal(resolve(report.dataDir), resolve(dataDir))
  assert.equal(report.databaseExists, true)
  assert.equal(report.appRunning, false)
} finally {
  rmSync(dataDir, { recursive: true, force: true })
}

console.log('portable CLI runner smoke test passed')
