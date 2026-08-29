import { useState } from 'react'

interface ProfileDialogProps {
  username: string
  avatarColor: string
  avatarImage: string | null
  onSave: (username: string, avatarColor: string, avatarImage: string | null) => Promise<void>
  onClose: () => void
}

export default function ProfileDialog({ username, avatarColor, avatarImage, onSave, onClose }: ProfileDialogProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(username)
  const [color, setColor] = useState(avatarColor)
  const [image, setImage] = useState<string | null>(avatarImage)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const choose = async () => {
    try {
      const selected = await window.calendarApi.chooseAvatar()
      if (selected) setImage(selected)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '选择头像失败')
    }
  }
  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(name, color, image)
      setEditing(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存账户失败')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="profile-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="profile-large-avatar" style={{ background: image ? `url(${image}) center/cover` : color }}>{image ? '' : (editing ? name : username).trim().slice(0, 1).toUpperCase() || 'A'}</div>
        {editing ? <input className="profile-name-input" value={name} onChange={(event) => setName(event.target.value)} /> : <div className="profile-dialog-name">{username}</div>}
        <div className="profile-dialog-note">本地账户 · 数据仅保存在此电脑</div>
        {editing && <div className="profile-edit-controls"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><button className="btn-text" onClick={() => void choose()}>更换头像</button></div>}
        {error && <div className="settings-error">{error}</div>}
        {editing ? <><button className="btn-text profile-edit-button" disabled={saving} onClick={() => void save()}>{saving ? '正在保存…' : '保存账户'}</button><button className="btn-text" disabled={saving} onClick={() => setEditing(false)}>取消</button></> : <><button className="btn-text profile-edit-button" onClick={() => { setError(''); setEditing(true) }}>编辑账户</button><button className="btn-text" onClick={onClose}>关闭</button></>}
      </div>
    </div>
  )
}
