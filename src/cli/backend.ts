import { existsSync, readFileSync } from 'node:fs'
import { openDatabase } from '../shared/db'
import { getRpcInfoPath, type RpcInfo } from '../shared/paths'
import { createMethodTable, type MethodTable } from '../shared/rpc-methods'
import { CalendarService } from '../shared/service'
import { CliError } from './errors'

export class Backend {
  private rpc: RpcInfo | null | undefined
  private table: MethodTable | null = null

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const viaApp = await this.tryApp<T>(method, params)
    if (viaApp !== undefined) return viaApp
    return this.callOffline<T>(method, params)
  }

  private async tryApp<T>(method: string, params: Record<string, unknown>): Promise<T | undefined> {
    if (this.rpc === undefined) this.rpc = probeApp()
    if (!this.rpc) return undefined
    try {
      const res = await fetch(`http://127.0.0.1:${this.rpc.port}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.rpc.token}` },
        body: JSON.stringify({ method, params }),
        signal: AbortSignal.timeout(3000)
      })
      const json = (await res.json()) as { ok: boolean; data?: T; error?: string }
      if (!json.ok) throw new CliError(json.error || '调用失败')
      return json.data as T
    } catch (error) {
      if (error instanceof CliError) throw error
      this.rpc = null
      return undefined
    }
  }

  private callOffline<T>(method: string, params: Record<string, unknown>): T {
    if (!this.table) this.table = createMethodTable(new CalendarService(openDatabase()))
    const fn = this.table.methods.get(method)
    if (!fn) throw new CliError(`未知方法: ${method}`)
    return fn(params) as T
  }
}

export function isAppRunning(): boolean {
  return probeApp() !== null
}

function probeApp(): RpcInfo | null {
  const path = getRpcInfoPath()
  if (!existsSync(path)) return null
  try {
    const info = JSON.parse(readFileSync(path, 'utf-8')) as RpcInfo
    return info?.port && info?.token ? info : null
  } catch {
    return null
  }
}
