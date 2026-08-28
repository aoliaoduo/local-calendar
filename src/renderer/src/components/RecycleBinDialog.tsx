import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import { api, type TrashInfo } from '../api'

interface RecycleBinDialogProps {
  onClose: () => void
  onToast: (message: string) => void
}

export default function RecycleBinDialog({ onClose, onToast }: RecycleBinDialogProps) {
  const [items, setItems] = useState<TrashInfo[]>([])
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try { setItems(await api.listTrash()) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const restore = async (item: TrashInfo) => {
    await api.restoreTrash(item.id)
    onToast(`已恢复${item.kind === 'event' ? '日程' : '任务'}：${item.title}`)
    await load()
  }

  const remove = async (item: TrashInfo) => {
    if (!window.confirm(`永久删除“${item.title}”？此操作无法撤销。`)) return
    await api.deleteTrash(item.id)
    onToast('已永久删除')
    await load()
  }

  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="recycle-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <div><div className="settings-title">回收站</div><div className="settings-subtitle">删除的日程和任务会暂存于此</div></div>
          <button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button>
        </div>
        <div className="recycle-list">
          {loading ? <div className="recycle-empty"><span className="material-icons">hourglass_empty</span><div>正在加载…</div></div> : items.length === 0 ? <div className="recycle-empty"><span className="material-icons">delete_outline</span><div>回收站为空</div><small>删除的日程和任务会显示在这里</small></div> : items.map((item) => (
            <div className="recycle-item" key={item.id}>
              <span className="material-icons">{item.kind === 'event' ? 'event' : 'check_circle_outline'}</span>
              <div className="recycle-item-body"><div>{item.title}</div><small>{item.kind === 'event' ? '日程' : '任务'} · {DateTime.fromISO(item.deletedAt).toLocal().toFormat('yyyy-MM-dd HH:mm')}</small></div>
              <button className="btn-text compact" onClick={() => void restore(item)}>恢复</button>
              <button className="icon-btn small" title="永久删除" onClick={() => void remove(item)}><span className="material-icons">delete_forever</span></button>
            </div>
          ))}
        </div>
        <div className="settings-foot"><span>永久删除后无法恢复</span><button className="btn-text" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
