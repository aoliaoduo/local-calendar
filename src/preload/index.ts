import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('calendarApi', {
  call: (method: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke('rpc', method, params) as Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
  onDataChanged: (callback: (payload: { method: string }) => void) => {
    const listener = (_e: unknown, payload: { method: string }) => callback(payload)
    ipcRenderer.on('data-changed', listener)
    return () => ipcRenderer.removeListener('data-changed', listener)
  },
  onAppToast: (callback: (message: string) => void) => {
    const listener = (_e: unknown, message: string) => callback(message)
    ipcRenderer.on('app-toast', listener)
    return () => ipcRenderer.removeListener('app-toast', listener)
  },
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,
  printCalendar: () => ipcRenderer.invoke('print-calendar') as Promise<boolean>,
  onWindowStateChanged: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window-state-changed', listener)
    return () => ipcRenderer.removeListener('window-state-changed', listener)
  },
  windowClose: () => ipcRenderer.send('window-close'),
  openDataDir: () => ipcRenderer.invoke('open-data-dir') as Promise<string>,
  backupData: () => ipcRenderer.invoke('backup-data') as Promise<string | null>,
  restoreData: () => ipcRenderer.invoke('restore-data') as Promise<string | null>,
  importIcs: () => ipcRenderer.invoke('import-ics') as Promise<number>,
  chooseAvatar: () => ipcRenderer.invoke('choose-avatar') as Promise<string | null>
})
