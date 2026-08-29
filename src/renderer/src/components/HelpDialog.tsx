import { useState } from 'react'
import type { CalendarInfo } from '../api'

interface HelpDialogProps {
  calendars: CalendarInfo[]
  onClose: () => void
}

export default function HelpDialog({ calendars, onClose }: HelpDialogProps) {
  const [copied, setCopied] = useState(false)
  const aiExample = 'localcal today\nlocalcal next\nlocalcal create "项目评审" -s 2026-09-01T10:00 -e 2026-09-01T11:00 --remind 30\nlocalcal task add "交周报" -d 2026-09-04 --remind 60\nlocalcal list --json\nlocalcal --data-dir "D:\\Calendar-B\\data" doctor --json'
  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="help-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <div>
            <div className="settings-title">使用说明</div>
            <div className="settings-subtitle">本地日历与 AI 操作指南</div>
          </div>
          <button className="icon-btn" title="关闭" onClick={onClose}><span className="material-icons">close</span></button>
        </div>
        <section className="help-section">
          <div className="settings-section-title">日常操作</div>
          <p>点击空白时间创建日程，按住鼠标拖动时间段可创建指定时长的日程。</p>
          <p>点击日程可编辑；月视图的“还有 n 项”会打开当天完整安排。</p>
          <p>左侧日历名称可控制显示，右上角设置可管理日历、主题、备份和导入。</p>
        </section>
        <section className="help-section">
          <div className="settings-section-title">AI / CLI</div>
          <p>AI 可以通过 `localcal` 命令直接操作本地数据，不需要登录或云端服务。</p>
          <div className="help-code-wrap"><pre className="help-code">{aiExample}</pre><button className="btn-text compact" onClick={() => { void navigator.clipboard.writeText(aiExample).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}>{copied ? '已复制' : '复制示例'}</button></div>
          <p>建议 AI 使用 `--json` 获取稳定结构化结果；多个便携包并存时，使用 `--data-dir` 明确指定目标包的 data 目录。ZIP 便携版可直接运行包目录的 `localcal.cmd`，无需另装 Node。</p>
        </section>
        <section className="help-section">
          <div className="settings-section-title">当前日历</div>
          <p>{calendars.filter((calendar) => calendar.id !== 'holidays').map((calendar) => `${calendar.id}（${calendar.name}）`).join(' · ') || '暂无可用日历'}</p>
        </section>
        <div className="settings-foot"><span>所有数据仅保存在本机</span><button className="btn-text" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
