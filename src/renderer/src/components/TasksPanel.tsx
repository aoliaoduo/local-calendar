import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import { api, type TaskInfo } from '../api'

interface TasksPanelProps {
  onClose: () => void
  onToast: (msg: string) => void
}

export default function TasksPanel({ onClose, onToast }: TasksPanelProps) {
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const today = DateTime.now().toISODate()!
  const [newDue, setNewDue] = useState(today)
  const [newReminder, setNewReminder] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editReminder, setEditReminder] = useState('')

  const load = async () => {
    setTasks(await api.listTasks('all'))
  }

  useEffect(() => {
    void load()
    const off = window.calendarApi.onDataChanged(() => void load())
    return off
  }, [])

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title) return
    await api.createTask({ title, dueAt: newDue || undefined, reminderMinutes: newReminder === '' ? null : Number(newReminder) })
    setNewTitle('')
    setNewDue(today)
    setNewReminder('')
    setAdding(false)
    onToast('已添加任务')
    void load()
  }

  const startEdit = (task: TaskInfo) => {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDue(task.dueAt ? DateTime.fromISO(task.dueAt).toLocal().toFormat('yyyy-MM-dd') : '')
    setEditNotes(task.notes ?? '')
    setEditReminder(task.reminderMinutes === null ? '' : String(task.reminderMinutes))
  }

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return
    try {
      await api.updateTask(editingId, { title: editTitle.trim(), dueAt: editDue || null, notes: editNotes.trim() || null, reminderMinutes: editReminder === '' ? null : Number(editReminder) })
      setEditingId(null)
      onToast('已更新任务')
      await load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : '更新任务失败')
    }
  }

  const open = tasks.filter((t) => t.status === 'needsAction')
  const done = tasks.filter((t) => t.status === 'completed')
  const matches = (task: TaskInfo) => !query.trim() || `${task.title} ${task.notes ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  const visibleOpen = open.filter(matches)
  const visibleDone = done.filter(matches)
  const todayStr = DateTime.now().toISODate()

  const renderTask = (t: TaskInfo) => {
    const dueDate = t.dueAt ? DateTime.fromISO(t.dueAt).toLocal() : null
    const overdue = dueDate && dueDate.toISODate()! < todayStr
    return (
      <div key={t.id} className="task-item">
        <button
          className={`task-check${t.status === 'completed' ? ' done' : ''}`}
          title={t.status === 'completed' ? '标记为未完成' : '标记为已完成'}
          onClick={() => {
            void api.updateTask(t.id, { completed: t.status !== 'completed' }).then(load)
          }}
        >
          {t.status === 'completed' && <span className="material-icons">check</span>}
        </button>
        {editingId === t.id ? (
          <div className="task-edit-form">
            <input autoFocus value={editTitle} onChange={(event) => setEditTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveEdit(); if (event.key === 'Escape') setEditingId(null) }} />
            <input type="date" value={editDue} onChange={(event) => setEditDue(event.target.value)} />
            <select value={editReminder} onChange={(event) => setEditReminder(event.target.value)}>
              <option value="">不提醒</option>
              <option value="0">截止时提醒</option>
              <option value="10">提前 10 分钟</option>
              <option value="30">提前 30 分钟</option>
              <option value="60">提前 1 小时</option>
            </select>
            <input placeholder="备注（可选）" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
            <div className="task-add-actions">
              <button className="btn-text compact" onClick={() => void saveEdit()}>保存</button>
              <button className="btn-text compact" onClick={() => setEditingId(null)}>取消</button>
            </div>
          </div>
        ) : (
          <div className="task-body" onDoubleClick={() => startEdit(t)}>
            <div className={`task-title${t.status === 'completed' ? ' done' : ''}`}>{t.title}</div>
            {dueDate && (
              <div className={`task-due${overdue ? ' overdue' : ''}`}>
                <span className="material-icons">calendar_today</span>
                {dueDate.toFormat('M月d日')}
              </div>
            )}
          {t.notes && <div className="task-notes">{t.notes}</div>}
          {t.reminderMinutes !== null && <div className="task-reminder"><span className="material-icons">notifications</span>已设置提醒</div>}
          </div>
        )}
        {editingId !== t.id && (
          <button className="task-edit" title="编辑" onClick={() => startEdit(t)}>
            <span className="material-icons">edit</span>
          </button>
        )}
        <button
          className="task-del"
          title="删除"
          onClick={() => {
            void api.deleteTask(t.id).then(() => {
              onToast('已删除任务')
              void load()
            })
          }}
        >
          <span className="material-icons">delete_outline</span>
        </button>
      </div>
    )
  }

  return (
    <aside className="tasks-panel">
      <div className="tasks-head">
        <button className="icon-btn" title="关闭" onClick={onClose}>
          <span className="material-icons">close</span>
        </button>
        <span className="tasks-title">任务</span>
        <button className="icon-btn" title="更多" onClick={() => setMoreOpen((value) => !value)}>
          <span className="material-icons">more_vert</span>
        </button>
        {moreOpen && (
          <div className="tasks-more-menu">
            <button onClick={() => { void Promise.all(done.map((task) => api.deleteTask(task.id))).then(() => { onToast('已清除已完成任务'); setMoreOpen(false); return load() }) }}>清除已完成任务</button>
          </div>
        )}
      </div>

      <div className="tasks-list">
        <input className="task-search" placeholder="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} />
        {adding ? (
          <div className="task-add-form">
            <span className="task-add-check" />
            <input
              autoFocus
              placeholder="任务标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setNewTitle('')
                  setNewDue(today)
                }
              }}
            />
            <input
              type="date"
              className="task-add-due"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
            <select className="task-add-reminder" value={newReminder} onChange={(event) => setNewReminder(event.target.value)}>
              <option value="">不提醒</option>
              <option value="0">截止时提醒</option>
              <option value="10">提前 10 分钟</option>
              <option value="30">提前 30 分钟</option>
              <option value="60">提前 1 小时</option>
            </select>
            <div className="task-add-actions">
              <button className="btn-text" onClick={() => void handleAdd()}>
                保存
              </button>
              <button
                className="btn-text"
                onClick={() => {
                  setAdding(false)
                  setNewTitle('')
                  setNewDue(today)
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button className="task-add-btn" onClick={() => setAdding(true)}>
            <span className="material-icons">add</span>
            添加任务
          </button>
        )}

        {visibleOpen.map(renderTask)}

        {visibleDone.length > 0 && (
          <>
            <button className="tasks-done-toggle" onClick={() => setShowDone((v) => !v)}>
              <span className="material-icons">{showDone ? 'expand_less' : 'expand_more'}</span>
              已完成的任务
            </button>
            {showDone && visibleDone.map(renderTask)}
          </>
        )}
      </div>
    </aside>
  )
}
