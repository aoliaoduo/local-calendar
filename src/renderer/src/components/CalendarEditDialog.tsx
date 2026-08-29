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
  const [submitting, setSubmitting] = useState(false)
  const save = async () => {
    if (submitting) return
    if (!name.trim()) {
      setError('请填写日历名称')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSave({ name: name.trim(), color })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="dlg-mask" onMouseDown={() => { if (!submitting) onClose() }}>
      <div className="calendar-edit-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head"><div><div className="settings-title">编辑日历</div><div className="settings-subtitle">{calendar.name}</div></div><button className="icon-btn" disabled={submitting} title="关闭" onClick={onClose}><span className="material-icons">close</span></button></div>
        <label className="calendar-edit-field"><span>名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="calendar-edit-field"><span>颜色</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        {error && <div className="settings-error">{error}</div>}
        <div className="settings-foot"><span /><div><button className="btn-text" disabled={submitting} onClick={onClose}>取消</button><button className="btn-text" disabled={submitting} onClick={() => void save()}>{submitting ? '正在保存…' : '保存'}</button></div></div>
      </div>
    </div>
  )
}
