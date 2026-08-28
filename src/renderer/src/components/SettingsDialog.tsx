import { useState } from 'react'
import type { CalendarInfo } from '../api'
import type { ViewKind } from './TopBar'

interface SettingsDialogProps {
  calendars: CalendarInfo[]
  view: ViewKind
  theme: 'light' | 'dark'
  onViewChange: (view: ViewKind) => void
  onThemeChange: (theme: 'light' | 'dark') => void
  onCalendarCreate: (name: string, color: string) => Promise<void>
  onCalendarUpdate: (id: string, patch: { name?: string; color?: string }) => Promise<void>
  onCalendarDelete: (id: string) => Promise<void>
  onOpenDataDir: () => Promise<string>
  onBackup: () => Promise<string | null>
  onRestore: () => Promise<string | null>
  onClose: () => void
}

export default function SettingsDialog({
  calendars,
  view,
  theme,
  onViewChange,
  onThemeChange,
  onCalendarCreate,
  onCalendarUpdate,
  onCalendarDelete,
  onOpenDataDir,
  onBackup,
  onRestore,
  onClose
}: SettingsDialogProps) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#1a73e8')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    try {
      await onCalendarCreate(newName, newColor)
      setNewName('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建日历失败')
    }
  }

  const saveName = async (calendar: CalendarInfo) => {
    try {
      await onCalendarUpdate(calendar.id, { name: editingName })
      setEditingId(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存日历失败')
    }
  }

  const openDataDir = async () => {
    setBusy(true)
    try {
      await onOpenDataDir()
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开数据目录失败')
    } finally {
      setBusy(false)
    }
  }

  const backup = async () => {
    setBusy(true)
    try {
      const path = await onBackup()
      if (path) setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '备份失败')
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!window.confirm('恢复备份会覆盖当前日历数据，应用将自动重启。确定继续吗？')) return
    setBusy(true)
    try {
      await onRestore()
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
      setBusy(false)
    }
  }

  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="settings-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <div>
            <div className="settings-title">设置</div>
            <div className="settings-subtitle">本地日历偏好与日历管理</div>
          </div>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <section className="settings-section">
          <div className="settings-section-title">显示</div>
          <label className="settings-field">
            <span>默认视图</span>
            <select value={view} onChange={(event) => onViewChange(event.target.value as ViewKind)}>
              <option value="day">日视图</option>
              <option value="week">周视图</option>
              <option value="month">月视图</option>
            </select>
          </label>
          <label className="settings-field">
            <span>主题</span>
            <select value={theme} onChange={(event) => onThemeChange(event.target.value as 'light' | 'dark')}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">我的日历</div>
          <div className="settings-calendar-list">
            {calendars.filter((calendar) => calendar.id !== 'holidays').map((calendar) => (
              <div className="settings-calendar-row" key={calendar.id}>
                <span className="settings-calendar-dot" style={{ background: calendar.color }} />
                {editingId === calendar.id ? (
                  <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                ) : (
                  <span className="settings-calendar-name">{calendar.name}</span>
                )}
                <input
                  className="settings-color"
                  type="color"
                  value={calendar.color}
                  title="修改颜色"
                  onChange={(event) => void onCalendarUpdate(calendar.id, { color: event.target.value })}
                />
                {calendar.isPrimary ? (
                  <span className="settings-primary">默认</span>
                ) : editingId === calendar.id ? (
                  <button className="btn-text compact" onClick={() => void saveName(calendar)}>保存</button>
                ) : (
                  <>
                    <button className="icon-btn small" title="重命名" onClick={() => { setEditingId(calendar.id); setEditingName(calendar.name) }}>
                      <span className="material-icons">edit</span>
                    </button>
                    <button className="icon-btn small" title="删除" onClick={() => void onCalendarDelete(calendar.id)}>
                      <span className="material-icons">delete_outline</span>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="settings-create-calendar">
            <input placeholder="新日历名称" value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create() }} />
            <input className="settings-color" type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} title="日历颜色" />
            <button className="btn-text compact" onClick={() => void create()} disabled={!newName.trim()}>添加</button>
          </div>
        </section>

        {error && <div className="settings-error">{error}</div>}
        <div className="settings-foot">
          <div className="settings-foot-actions">
            <button className="btn-text compact" disabled={busy} onClick={() => void openDataDir()}>打开数据目录</button>
            <button className="btn-text compact" disabled={busy} onClick={() => void backup()}>备份数据</button>
            <button className="btn-text compact" disabled={busy} onClick={() => void restore()}>恢复备份</button>
          </div>
          <button className="btn-text" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}
