import { useState } from 'react'
import { DateTime } from 'luxon'
import { api, type TaskInfo } from '../api'

interface TaskDialogProps {
  task: TaskInfo
  occurrenceIndex?: number
  occurrenceDue?: string
  onClose: () => void
  onSaved: (message: string) => void
}

export default function TaskDialog({ task, occurrenceIndex, occurrenceDue, onClose, onSaved }: TaskDialogProps) {
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState((occurrenceDue || task.dueAt) ? DateTime.fromISO(occurrenceDue || task.dueAt!).toLocal().toFormat('yyyy-MM-dd') : '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [reminder, setReminder] = useState(task.reminderMinutes === null ? (task.dueAt ? '900' : '') : String(task.reminderMinutes))
  const [priority, setPriority] = useState(String(task.priority ?? 0))
  const [rrule, setRrule] = useState(task.rrule ?? '')
  const [editScope, setEditScope] = useState<'occurrence' | 'series'>(occurrenceIndex === undefined ? 'series' : 'occurrence')
  const [completed, setCompleted] = useState(task.status === 'completed')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const save = async () => {
    if (submitting) return
    if (!title.trim()) {
      setError('请填写任务标题')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const patch = { title: title.trim(), dueAt: due || null, notes: notes.trim() || null, reminderMinutes: reminder === '' ? null : Number(reminder), priority: Number(priority), rrule: rrule || null, completed }
      if (occurrenceIndex !== undefined && editScope === 'occurrence') await api.updateTaskOccurrence(task.id, occurrenceIndex, patch)
      else await api.updateTask(task.id, patch)
      onSaved('已更新任务')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      if (occurrenceIndex !== undefined && editScope === 'occurrence') await api.deleteTaskOccurrence(task.id, occurrenceIndex)
      else await api.deleteTask(task.id)
      onSaved('已删除任务')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dlg-mask" onMouseDown={() => { if (!submitting) onClose() }}>
      <div className="task-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head"><div><div className="settings-title">编辑任务</div><div className="settings-subtitle">任务与日历共享同一份本地数据</div></div><button className="icon-btn" disabled={submitting} title="关闭" onClick={onClose}><span className="material-icons">close</span></button></div>
        <input className="task-dialog-title" autoFocus value={title} placeholder="任务标题" onChange={(event) => setTitle(event.target.value)} />
        <label className="task-dialog-field"><span className="material-icons">event</span><span>截止日期</span><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
        {occurrenceIndex !== undefined && <label className="task-dialog-field"><span className="material-icons">event_repeat</span><span>应用范围</span><select value={editScope} onChange={(event) => { const next = event.target.value as 'occurrence' | 'series'; setEditScope(next); const value = next === 'series' ? task.dueAt : occurrenceDue; setDue(value ? DateTime.fromISO(value).toLocal().toFormat('yyyy-MM-dd') : '') }}><option value="occurrence">仅此任务</option><option value="series">整个系列</option></select></label>}
        <label className="task-dialog-field"><span className="material-icons">notifications</span><span>提醒</span><select value={reminder} onChange={(event) => setReminder(event.target.value)}><option value="">不提醒</option><option value="900">当天 09:00</option><option value="0">截止时提醒</option><option value="10">提前 10 分钟</option><option value="30">提前 30 分钟</option><option value="60">提前 1 小时</option></select></label>
        <label className="task-dialog-field"><span className="material-icons">priority_high</span><span>优先级</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="1">高</option><option value="0">普通</option><option value="-1">低</option></select></label>
        <label className="task-dialog-field"><span className="material-icons">repeat</span><span>重复</span><select value={rrule} onChange={(event) => setRrule(event.target.value)}><option value="">不重复</option><option value="FREQ=DAILY">每天</option><option value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">每个工作日</option><option value="FREQ=WEEKLY">每周</option><option value="FREQ=MONTHLY">每月</option><option value="FREQ=YEARLY">每年</option></select></label>
        <label className="task-dialog-check"><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} />已完成</label>
        <textarea className="task-dialog-notes" placeholder="添加备注" value={notes} onChange={(event) => setNotes(event.target.value)} />
        {error && <div className="settings-error">{error}</div>}
        <div className="settings-foot"><button className="btn-text danger" disabled={submitting} onClick={() => void remove()}>{submitting ? '正在处理…' : '删除'}</button><div><button className="btn-text" disabled={submitting} onClick={onClose}>取消</button><button className="btn-text" disabled={submitting} onClick={() => void save()}>{submitting ? '正在保存…' : '保存'}</button></div></div>
      </div>
    </div>
  )
}
