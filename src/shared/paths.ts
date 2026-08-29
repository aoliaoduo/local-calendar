import { dirname, join, resolve } from 'node:path'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

export const APP_DIR_NAME = 'local-calendar'

export function getDataDir(): string {
  const explicitDir = process.env.LOCAL_CALENDAR_DATA_DIR?.trim()
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  const packageDir = process.env.LOCAL_CALENDAR_PACKAGE_DIR?.trim() || findPackageDir()
  const localDir = join(packageDir, 'data')
  const dir = explicitDir
    ? resolve(explicitDir)
    : portableDir
      ? join(resolve(portableDir), 'data')
      : localDir
  mkdirSync(dir, { recursive: true })
  migrateLegacyData(dir)
  return dir
}

function findPackageDir(): string {
  let dir = resolve(process.cwd())
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(dir, 'package.json')) && (existsSync(join(dir, 'src')) || existsSync(join(dir, 'out')))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function migrateLegacyData(targetDir: string): void {
  const appData = process.env.APPDATA?.trim()
  if (!appData) return
  const legacyDir = resolve(appData, APP_DIR_NAME)
  if (resolve(targetDir) === legacyDir || existsSync(join(targetDir, 'calendar.db')) || !existsSync(join(legacyDir, 'calendar.db'))) return
  copyFileSync(join(legacyDir, 'calendar.db'), join(targetDir, 'calendar.db'))
  for (const suffix of ['-wal', '-shm']) {
    const source = join(legacyDir, `calendar.db${suffix}`)
    if (existsSync(source)) copyFileSync(source, join(targetDir, `calendar.db${suffix}`))
  }
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
