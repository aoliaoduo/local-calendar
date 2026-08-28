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
  const [newDue, setNewDue] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editNotes, setEditNotes] = useState('')

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
    await api.createTask({ title, dueAt: newDue || undefined })
    setNewTitle('')
    setNewDue('')
    setAdding(false)
    onToast('已添加任务')
    void load()
  }

  const startEdit = (task: TaskInfo) => {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDue(task.dueAt ? DateTime.fromISO(task.dueAt).toLocal().toFormat('yyyy-MM-dd') : '')
    setEditNotes(task.notes ?? '')
  }

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return
    try {
      await api.updateTask(editingId, { title: editTitle.trim(), dueAt: editDue || null, notes: editNotes.trim() || null })
      setEditingId(null)
      onToast('已更新任务')
      await load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : '更新任务失败')
    }
  }

  const open = tasks.filter((t) => t.status === 'needsAction')
  const done = tasks.filter((t) => t.status === 'completed')
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
        <button className="icon-btn" title="更多">
          <span className="material-icons">more_vert</span>
        </button>
      </div>

      <div className="tasks-list">
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
                }
              }}
            />
            <input
              type="date"
              className="task-add-due"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
            <div className="task-add-actions">
              <button className="btn-text" onClick={() => void handleAdd()}>
                保存
              </button>
              <button
                className="btn-text"
                onClick={() => {
                  setAdding(false)
                  setNewTitle('')
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

        {open.map(renderTask)}

        {done.length > 0 && (
          <>
            <button className="tasks-done-toggle" onClick={() => setShowDone((v) => !v)}>
              <span className="material-icons">{showDone ? 'expand_less' : 'expand_more'}</span>
              已完成的任务
            </button>
            {showDone && done.map(renderTask)}
          </>
        )}
      </div>
    </aside>
  )
}
