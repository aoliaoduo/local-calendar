import { useEffect, useRef, useState } from 'react'
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
  const [newNotes, setNewNotes] = useState('')
  const today = DateTime.now().toISODate()!
  const [newDue, setNewDue] = useState(today)
  const [newReminder, setNewReminder] = useState('900')
  const [newPriority, setNewPriority] = useState('0')
  const [newRrule, setNewRrule] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [taskListOpen, setTaskListOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editReminder, setEditReminder] = useState('')
  const [editPriority, setEditPriority] = useState('0')
  const [dragId, setDragId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'scheduled'>('all')
  const [sortMode, setSortMode] = useState<'manual' | 'due' | 'priority' | 'created'>('due')
  const [sortOpen, setSortOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const taskAddRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const [editRrule, setEditRrule] = useState('')

  const load = async () => {
    setTasks(await api.listTasks('all'))
  }

  useEffect(() => {
    void load()
    const off = window.calendarApi.onDataChanged(() => void load())
    return off
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [moreOpen])

  useEffect(() => {
    if (!taskListOpen) return
    const close = (event: PointerEvent) => { if (!taskListRef.current?.contains(event.target as Node)) setTaskListOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [taskListOpen])

  useEffect(() => {
    if (!sortOpen) return
    const close = (event: PointerEvent) => { if (!sortRef.current?.contains(event.target as Node)) setSortOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [sortOpen])

  useEffect(() => {
    if (!adding) return
    const close = (event: PointerEvent) => {
      if (!taskAddRef.current?.contains(event.target as Node)) {
        setAdding(false)
        setNewTitle('')
        setNewNotes('')
        setNewDue(today)
        setNewReminder('900')
        setNewRrule('')
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [adding, today])

  useEffect(() => {
    const close = () => {
      if (!adding) return
      setAdding(false)
      setNewTitle('')
      setNewNotes('')
      setNewDue(today)
      setNewReminder('900')
      setNewRrule('')
    }
    document.addEventListener('calendar-transient-dismiss', close)
    return () => document.removeEventListener('calendar-transient-dismiss', close)
  }, [adding, today])

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title) return
    await api.createTask({ title, notes: newNotes.trim() || undefined, dueAt: newDue || undefined, reminderMinutes: !newDue ? null : (newReminder === '' ? null : Number(newReminder)), priority: Number(newPriority), rrule: newRrule || null })
    setNewTitle('')
    setNewNotes('')
    setNewDue(today)
    setNewReminder('900')
    setNewPriority('0')
    setNewRrule('')
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
    setEditPriority(String(task.priority ?? 0))
    setEditRrule(task.rrule ?? '')
  }

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return
    try {
      await api.updateTask(editingId, { title: editTitle.trim(), dueAt: editDue || null, notes: editNotes.trim() || null, reminderMinutes: editReminder === '' ? null : Number(editReminder), priority: Number(editPriority), rrule: editRrule || null })
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
  const filteredOpen = visibleOpen.filter((task) => {
    if (filter === 'all') return true
    if (!task.dueAt) return false
    const date = DateTime.fromISO(task.dueAt).toLocal().toISODate()
    if (filter === 'today') return date === todayStr
    if (filter === 'overdue') return date! < todayStr!
    return true
  })
  const sortedOpen = [...filteredOpen].sort((first, second) => {
    if (sortMode === 'priority') return (second.priority ?? 0) - (first.priority ?? 0)
    if (sortMode === 'created') return second.createdAt.localeCompare(first.createdAt)
    if (sortMode === 'due') {
      if (!first.dueAt) return 1
      if (!second.dueAt) return -1
      return first.dueAt.localeCompare(second.dueAt)
    }
    return (first.sortOrder ?? 0) - (second.sortOrder ?? 0)
  })
  const groupSort = (items: TaskInfo[]) => [...items].sort((first, second) => {
    if (!first.dueAt) return 1
    if (!second.dueAt) return -1
    return first.dueAt.localeCompare(second.dueAt)
  })
  const groupTasks = (items: TaskInfo[]) => {
    const today = DateTime.now().startOf('day')
    const groups = [
      { key: 'overdue', label: '已逾期', items: [] as TaskInfo[] },
      { key: 'today', label: '今天', items: [] as TaskInfo[] },
      { key: 'upcoming', label: '接下来 7 天', items: [] as TaskInfo[] },
      { key: 'later', label: '以后', items: [] as TaskInfo[] },
      { key: 'none', label: '无日期', items: [] as TaskInfo[] }
    ]
    for (const task of items) {
      if (!task.dueAt) groups[4].items.push(task)
      else {
        const day = DateTime.fromISO(task.dueAt).toLocal().startOf('day')
        if (day < today) groups[0].items.push(task)
        else if (day.hasSame(today, 'day')) groups[1].items.push(task)
        else if (day <= today.plus({ days: 7 })) groups[2].items.push(task)
        else groups[3].items.push(task)
      }
    }
    const rank = new Map(groups.map((group, index) => [group.key, index]))
    return groups
      .filter((group) => group.items.length > 0)
      .sort((first, second) => (rank.get(first.key) ?? 0) - (rank.get(second.key) ?? 0))
      .map((group) => ({ ...group, items: groupSort(group.items) }))
  }

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = open.map((task) => task.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    try {
      await api.reorderTasks(ids)
      await load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : '排序失败')
    } finally {
      setDragId(null)
    }
  }

  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const batchComplete = async () => {
    const ids = [...selected]
    try {
      await Promise.all(ids.map((id) => api.updateTask(id, { completed: true })))
      setSelected(new Set())
      onToast(`已完成 ${ids.length} 个任务`)
      await load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : '批量完成失败')
    }
  }

  const batchDelete = async () => {
    const ids = [...selected]
    if (!ids.length || !window.confirm(`将 ${ids.length} 个任务移入回收站？`)) return
    try {
      await Promise.all(ids.map((id) => api.deleteTask(id)))
      setSelected(new Set())
      onToast(`已删除 ${ids.length} 个任务`)
      await load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : '批量删除失败')
    }
  }

  const renderTask = (t: TaskInfo) => {
    const dueDate = t.dueAt ? DateTime.fromISO(t.dueAt).toLocal() : null
    const overdue = dueDate && dueDate.toISODate()! < todayStr
    return (
      <div key={t.id} className={`task-item${dragId === t.id ? ' dragging' : ''}`} draggable={t.status === 'needsAction' && sortMode === 'manual'} onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)} onDragOver={(event) => { if (t.status === 'needsAction' && sortMode === 'manual') event.preventDefault() }} onDrop={(event) => { event.preventDefault(); void handleDrop(t.id) }}>
        {t.status === 'needsAction' && sortMode === 'manual' && <span className="material-icons task-drag-handle" title="拖动排序">drag_handle</span>}
        <input className="task-select" type="checkbox" aria-label={`选择${t.title}`} checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} onClick={(event) => event.stopPropagation()} />
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
              <option value="900">当天 09:00</option>
              <option value="0">截止时提醒</option>
              <option value="10">提前 10 分钟</option>
              <option value="30">提前 30 分钟</option>
              <option value="60">提前 1 小时</option>
            </select>
            <select value={editRrule} onChange={(event) => setEditRrule(event.target.value)}><option value="">不重复</option><option value="FREQ=DAILY">每天</option><option value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">每个工作日</option><option value="FREQ=WEEKLY">每周</option><option value="FREQ=MONTHLY">每月</option><option value="FREQ=YEARLY">每年</option></select>
            <select value={editPriority} onChange={(event) => setEditPriority(event.target.value)}><option value="1">高优先级</option><option value="0">普通优先级</option><option value="-1">低优先级</option></select>
            <input placeholder="备注（可选）" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
            <div className="task-add-actions">
              <button className="btn-text compact" onClick={() => void saveEdit()}>保存</button>
              <button className="btn-text compact" onClick={() => setEditingId(null)}>取消</button>
            </div>
          </div>
        ) : (
          <div className="task-body" onDoubleClick={() => startEdit(t)}>
            <div className={`task-title${t.status === 'completed' ? ' done' : ''}`}>{t.priority === 1 && <span className="material-icons task-priority high">priority_high</span>}{t.priority === -1 && <span className="material-icons task-priority low">arrow_downward</span>}{t.rrule && <span className="material-icons task-priority repeat">repeat</span>}{t.title}</div>
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
        <div className="tasks-heading" ref={taskListRef}>
          <span className="tasks-eyebrow">TASKS</span>
          <button className={`tasks-list-selector${taskListOpen ? ' active' : ''}`} title="任务列表" aria-expanded={taskListOpen} onClick={() => setTaskListOpen((value) => !value)}><span>我的任务</span><span className="material-icons">arrow_drop_down</span></button>
          {taskListOpen && <div className="tasks-list-menu"><button className="active"><span className="material-icons">check</span><span>我的任务</span></button><button onClick={() => { setShowDone(true); setTaskListOpen(false) }}><span className="material-icons">done_all</span><span>已完成任务</span></button></div>}
        </div>
        <div className="tasks-head-actions">
          <button className="icon-btn" title="搜索任务" onClick={() => setSearchOpen(true)}><span className="material-icons">search</span></button>
          <button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button>
        </div>
      </div>

      <div className="tasks-list">
        {query || searchOpen ? <input autoFocus className="task-search" placeholder="搜索任务" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => { if (!query) setSearchOpen(false) }} /> : null}
        <div className="task-add-bar" ref={moreMenuRef}>
          <button className="task-add-trigger" onClick={() => setAdding(true)}><span className="material-icons">add_task</span><span>添加任务</span></button>
          <button className={`icon-btn task-more-button${moreOpen ? ' active' : ''}`} title="更多" onClick={() => setMoreOpen((value) => !value)}><span className="material-icons">more_vert</span></button>
          {moreOpen && <div className="tasks-more-menu"><button onClick={() => { setMoreOpen(false); setSearchOpen(true) }}><span className="material-icons">search</span>搜索任务</button><button onClick={() => { setMoreOpen(false); setSortOpen((value) => !value) }}><span className="material-icons">sort</span>排序任务</button><button onClick={() => { void Promise.all(done.map((task) => api.deleteTask(task.id))).then(() => { onToast('已清除已完成任务'); setMoreOpen(false); return load() }) }} disabled={done.length === 0}><span className="material-icons">cleaning_services</span>清除已完成任务</button></div>}
        </div>
        <div className="task-filters" role="tablist" aria-label="任务筛选">
          {([['all', '全部'], ['today', '今天'], ['overdue', '逾期'], ['scheduled', '有日期']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
        {sortOpen && <div className="task-sort-menu task-sort-menu-inline" ref={sortRef}><div className="task-sort-menu-title">排序依据</div>{([['manual', '我的顺序'], ['due', '日期'], ['priority', '优先级'], ['created', '最近创建']] as const).map(([key, label]) => <button key={key} className={sortMode === key ? 'active' : ''} onClick={() => { setSortMode(key); setSortOpen(false) }}>{sortMode === key && <span className="material-icons">check</span>}<span>{label}</span></button>)}</div>}
        {selected.size > 0 && <div className="task-bulk-bar"><span>已选 {selected.size}</span><button className="btn-text compact" onClick={() => void batchComplete()}>完成</button><button className="btn-text compact danger" onClick={() => void batchDelete()}>删除</button><button className="icon-btn compact" title="清除选择" onClick={() => setSelected(new Set())}><span className="material-icons">close</span></button></div>}
        {adding && (
          <div ref={taskAddRef} className="task-add-form">
            <span className="task-add-check" />
            <textarea
              autoFocus
              className="task-add-title"
              placeholder="任务标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAdd()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setNewTitle('')
                  setNewNotes('')
                  setNewDue(today)
                }
              }}
            />
            <textarea className="task-add-notes" placeholder="详细信息" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            <input
              type="date"
              className="task-add-due"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
            <div className="task-date-chips">
              <button type="button" onClick={() => setNewDue(today)}>今天</button>
              <button type="button" onClick={() => setNewDue(DateTime.now().plus({ days: 1 }).toISODate()!)}>明天</button>
              <button type="button" onClick={() => setNewDue('')}>清除日期</button>
            </div>
            <select className="task-add-reminder" value={newReminder} onChange={(event) => setNewReminder(event.target.value)}>
              <option value="">不提醒</option>
              <option value="900">当天 09:00</option>
              <option value="0">截止时提醒</option>
              <option value="10">提前 10 分钟</option>
              <option value="30">提前 30 分钟</option>
              <option value="60">提前 1 小时</option>
            </select>
            <select className="task-add-reminder" value={newRrule} onChange={(event) => setNewRrule(event.target.value)}><option value="">不重复</option><option value="FREQ=DAILY">每天</option><option value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">每个工作日</option><option value="FREQ=WEEKLY">每周</option><option value="FREQ=MONTHLY">每月</option><option value="FREQ=YEARLY">每年</option></select>
            <select className="task-add-reminder" value={newPriority} onChange={(event) => setNewPriority(event.target.value)}><option value="1">高优先级</option><option value="0">普通优先级</option><option value="-1">低优先级</option></select>
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
        )}

        {groupTasks(sortedOpen).map((group) => <section className="task-group" key={group.key}><div className="task-group-label">{group.label}</div>{group.items.map(renderTask)}</section>)}
        {groupTasks(sortedOpen).length === 0 && visibleDone.length === 0 && <div className="task-empty"><div className="task-empty-illustration"><span className="material-icons">task_alt</span></div><div className="task-empty-title">还没有任务</div><div className="task-empty-subtitle">添加待办事项，并在日历中跟踪它们</div></div>}

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
