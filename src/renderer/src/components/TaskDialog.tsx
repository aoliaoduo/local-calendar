import { useState } from 'react'
import { DateTime } from 'luxon'
import { api, type TaskInfo } from '../api'

interface TaskDialogProps {
  task: TaskInfo
  onClose: () => void
  onSaved: (message: string) => void
}

export default function TaskDialog({ task, onClose, onSaved }: TaskDialogProps) {
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.dueAt ? DateTime.fromISO(task.dueAt).toLocal().toFormat('yyyy-MM-dd') : '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [reminder, setReminder] = useState(task.reminderMinutes === null ? '' : String(task.reminderMinutes))
  const [completed, setCompleted] = useState(task.status === 'completed')
  const [error, setError] = useState('')

  const save = async () => {
    if (!title.trim()) return
    try {
      await api.updateTask(task.id, { title: title.trim(), dueAt: due || null, notes: notes.trim() || null, reminderMinutes: reminder === '' ? null : Number(reminder), completed })
      onSaved('已更新任务')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新任务失败')
    }
  }

  const remove = async () => {
    try {
      await api.deleteTask(task.id)
      onSaved('已删除任务')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败')
    }
  }

  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="task-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head"><div><div className="settings-title">编辑任务</div><div className="settings-subtitle">任务与日历共享同一份本地数据</div></div><button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button></div>
        <input className="task-dialog-title" autoFocus value={title} placeholder="任务标题" onChange={(event) => setTitle(event.target.value)} />
        <label className="task-dialog-field"><span className="material-icons">event</span><span>截止日期</span><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
        <label className="task-dialog-field"><span className="material-icons">notifications</span><span>提醒</span><select value={reminder} onChange={(event) => setReminder(event.target.value)}><option value="">不提醒</option><option value="0">截止时提醒</option><option value="10">提前 10 分钟</option><option value="30">提前 30 分钟</option><option value="60">提前 1 小时</option></select></label>
        <label className="task-dialog-check"><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} />已完成</label>
        <textarea className="task-dialog-notes" placeholder="添加备注" value={notes} onChange={(event) => setNotes(event.target.value)} />
        {error && <div className="settings-error">{error}</div>}
        <div className="settings-foot"><button className="btn-text danger" onClick={() => void remove()}>删除</button><div><button className="btn-text" onClick={onClose}>取消</button><button className="btn-text" onClick={() => void save()}>保存</button></div></div>
      </div>
    </div>
  )
}
