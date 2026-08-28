import { dirname, join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

export const APP_DIR_NAME = 'local-calendar'

export function getDataDir(): string {
  const explicitDir = process.env.LOCAL_CALENDAR_DATA_DIR?.trim()
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  const packageDir = process.env.LOCAL_CALENDAR_PACKAGE_DIR?.trim() || findPackageDir()
  const localDir = join(packageDir, 'data')
  const dir = explicitDir
    ? explicitDir
    : portableDir
      ? join(portableDir, 'data')
      : localDir
  mkdirSync(dir, { recursive: true })
  const legacyDir = join(process.env.APPDATA || '', APP_DIR_NAME)
  if (dir !== legacyDir && !existsSync(join(dir, 'calendar.db')) && existsSync(join(legacyDir, 'calendar.db'))) {
    copyFileSync(join(legacyDir, 'calendar.db'), join(dir, 'calendar.db'))
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(join(legacyDir, `calendar.db${suffix}`))) copyFileSync(join(legacyDir, `calendar.db${suffix}`), join(dir, `calendar.db${suffix}`))
    }
  }
  return dir
}

function findPackageDir(): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 5; depth++) {
    if (dir.endsWith('local-calendar') || dir.endsWith('20260828003809')) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function getDbPath(): string {
  return join(getDataDir(), 'calendar.db')
}

export function getRpcInfoPath(): string {
  return join(getDataDir(), 'rpc.json')
}

export interface RpcInfo {
  port: number
  token: string
}
