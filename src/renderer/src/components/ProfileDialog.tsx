interface ProfileDialogProps {
  username: string
  avatarColor: string
  avatarImage: string | null
  onEdit: () => void
  onClose: () => void
}

export default function ProfileDialog({ username, avatarColor, avatarImage, onEdit, onClose }: ProfileDialogProps) {
  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="profile-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="profile-large-avatar" style={{ background: avatarImage ? `url(${avatarImage}) center/cover` : avatarColor }}>{avatarImage ? '' : username.trim().slice(0, 1).toUpperCase() || 'A'}</div>
        <div className="profile-dialog-name">{username}</div>
        <div className="profile-dialog-note">本地账户 · 数据仅保存在此电脑</div>
        <button className="btn-text profile-edit-button" onClick={() => { onClose(); onEdit() }}>编辑账户</button>
        <button className="btn-text" onClick={onClose}>关闭</button>
      </div>
    </div>
  )
}
