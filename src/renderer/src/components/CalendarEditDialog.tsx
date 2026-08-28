import { useState } from 'react'
import type { CalendarInfo } from '../api'

interface CalendarEditDialogProps {
  calendar: CalendarInfo
  onSave: (patch: { name: string; color: string }) => Promise<void>
  onClose: () => void
}

export default function CalendarEditDialog({ calendar, onSave, onClose }: CalendarEditDialogProps) {
  const [name, setName] = useState(calendar.name)
  const [color, setColor] = useState(calendar.color)
  const [error, setError] = useState('')
  const save = async () => {
    try { await onSave({ name, color }); onClose() } catch (err) { setError(err instanceof Error ? err.message : '保存失败') }
  }
  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="calendar-edit-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head"><div><div className="settings-title">编辑日历</div><div className="settings-subtitle">{calendar.name}</div></div><button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button></div>
        <label className="calendar-edit-field"><span>名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="calendar-edit-field"><span>颜色</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        {error && <div className="settings-error">{error}</div>}
        <div className="settings-foot"><span /><div><button className="btn-text" onClick={onClose}>取消</button><button className="btn-text" onClick={() => void save()}>保存</button></div></div>
      </div>
    </div>
  )
}
