import type { ViewKind } from './TopBar'

interface SettingsDialogProps {
  view: ViewKind
  onViewChange: (view: ViewKind) => void
  weekStart: 0 | 1
  onWeekStartChange: (value: 0 | 1) => void
  onOpenDataDir: () => Promise<string>
  onBackup: () => Promise<string | null>
  onRestore: () => Promise<string | null>
  onImportIcs: () => Promise<number>
  onOpenRecycleBin: () => void
  notificationsEnabled: boolean
  onNotificationsChange: (enabled: boolean) => void
  onClose: () => void
}

export default function SettingsDialog({ view, onViewChange, weekStart, onWeekStartChange, onOpenDataDir, onBackup, onRestore, onImportIcs, onOpenRecycleBin, notificationsEnabled, onNotificationsChange, onClose }: SettingsDialogProps) {
  const run = async (action: () => Promise<unknown>) => {
    try { await action() } catch { /* 操作错误由主界面 toast 或系统对话框反馈 */ }
  }

  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="settings-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <div><div className="settings-title">设置</div><div className="settings-subtitle">本地日历运行与数据管理</div></div>
          <button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button>
        </div>
        <section className="settings-section">
          <div className="settings-section-title">默认视图</div>
          <label className="settings-field"><span>启动时显示</span><select value={view} onChange={(event) => onViewChange(event.target.value as ViewKind)}><option value="day">日视图</option><option value="4day">4 天视图</option><option value="week">周视图</option><option value="month">月视图</option><option value="year">年视图</option><option value="agenda">日程视图</option></select></label>
          <label className="settings-field"><span>每周起始日</span><select value={String(weekStart)} onChange={(event) => onWeekStartChange(event.target.value === '1' ? 1 : 0)}><option value="0">周日</option><option value="1">周一</option></select></label>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">通知</div>
          <label className="settings-toggle"><input type="checkbox" checked={notificationsEnabled} onChange={(event) => onNotificationsChange(event.target.checked)} /><span>启用日程和任务提醒</span></label>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">数据工具</div>
          <div className="settings-tool-grid">
            <button className="settings-tool" onClick={() => void run(onOpenDataDir)}><span className="material-icons">folder_open</span><span>打开数据目录</span></button>
            <button className="settings-tool" onClick={() => void run(onBackup)}><span className="material-icons">download</span><span>备份数据库</span></button>
            <button className="settings-tool" onClick={() => void run(onRestore)}><span className="material-icons">restore</span><span>恢复备份</span></button>
            <button className="settings-tool" onClick={() => void run(onImportIcs)}><span className="material-icons">file_upload</span><span>导入 ICS</span></button>
            <button className="settings-tool" onClick={onOpenRecycleBin}><span className="material-icons">delete_outline</span><span>打开回收站</span></button>
          </div>
        </section>
        <div className="settings-foot"><span>数据仅保存在本机</span><button className="btn-text" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
