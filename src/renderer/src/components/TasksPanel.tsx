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
        <div className="task-body">
          <div className={`task-title${t.status === 'completed' ? ' done' : ''}`}>{t.title}</div>
          {dueDate && (
            <div className={`task-due${overdue ? ' overdue' : ''}`}>
              <span className="material-icons">calendar_today</span>
              {dueDate.toFormat('M月d日')}
            </div>
          )}
          {t.notes && <div className="task-notes">{t.notes}</div>}
        </div>
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
