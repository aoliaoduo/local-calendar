interface AppearanceDialogProps {
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
  onClose: () => void
}

export default function AppearanceDialog({ theme, onThemeChange, onClose }: AppearanceDialogProps) {
  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="appearance-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head"><div><div className="settings-title">外观</div><div className="settings-subtitle">调整本地日历的视觉风格</div></div><button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button></div>
        <div className="appearance-options">
          <button className={`appearance-option${theme === 'light' ? ' selected' : ''}`} onClick={() => onThemeChange('light')}><span className="appearance-swatch light" /><span><strong>浅色</strong><small>清爽明亮的工作界面</small></span>{theme === 'light' && <span className="material-icons">check</span>}</button>
          <button className={`appearance-option${theme === 'dark' ? ' selected' : ''}`} onClick={() => onThemeChange('dark')}><span className="appearance-swatch dark" /><span><strong>暗夜</strong><small>近黑色背景，少量蓝色强调</small></span>{theme === 'dark' && <span className="material-icons">check</span>}</button>
        </div>
        <div className="settings-foot"><span>外观设置仅保存在本机</span><button className="btn-text" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
