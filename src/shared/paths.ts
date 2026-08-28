import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'

export const APP_DIR_NAME = 'local-calendar'

export function getDataDir(): string {
  const explicitDir = process.env.LOCAL_CALENDAR_DATA_DIR?.trim()
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  const dir = explicitDir
    ? explicitDir
    : portableDir
      ? join(portableDir, 'data')
      : join(process.env.APPDATA || process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), APP_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  return dir
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
