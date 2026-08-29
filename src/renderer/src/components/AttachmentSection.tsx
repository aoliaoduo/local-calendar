import { useEffect, useState } from 'react'
import { api, type AttachmentInfo, type AttachmentUpload } from '../api'

interface AttachmentSectionProps {
  ownerKind: 'event' | 'task'
  ownerId: string
}

function bytesLabel(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function uploadFromFile(file: File): Promise<AttachmentUpload> {
  if (file.size > 8 * 1024 * 1024) throw new Error('附件不能超过 8 MB')
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取附件失败'))
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '')
    reader.readAsDataURL(file)
  })
  return {
    name: file.name || `pasted-image-${Date.now()}.png`,
    mimeType: file.type || 'application/octet-stream',
    contentBase64
  }
}

export default function AttachmentSection({ ownerKind, ownerId }: AttachmentSectionProps) {
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setAttachments(await api.listAttachments(ownerKind, ownerId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载附件失败')
    }
  }

  useEffect(() => { void load() }, [ownerKind, ownerId])

  const addUpload = async (upload: AttachmentUpload) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.createAttachment(ownerKind, ownerId, upload)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '添加附件失败')
    } finally {
      setBusy(false)
    }
  }

  const addFile = async (file: File) => addUpload(await uploadFromFile(file))

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.size > 0)
      if (!file) return
      event.preventDefault()
      void addFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  const choose = async () => {
    try {
      const upload = await window.calendarApi.chooseAttachment()
      if (upload) await addUpload(upload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '选择附件失败')
    }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api.deleteAttachment(id)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除附件失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="attachment-section">
      <div className="attachment-head"><span className="material-icons">attach_file</span><span>附件</span><button type="button" className="btn-text compact" disabled={busy} onClick={() => void choose()}>添加文件</button></div>
      <div className="attachment-drop-hint">按 Ctrl+V 可直接粘贴图片</div>
      {attachments.map((attachment) => (
        <div className="attachment-item" key={attachment.id}>
          <span className="material-icons">{attachment.mimeType.startsWith('image/') ? 'image' : 'insert_drive_file'}</span>
          <button type="button" className="attachment-open" title="打开附件" onClick={() => void window.calendarApi.openAttachment(attachment.id).catch((reason) => setError(reason instanceof Error ? reason.message : '打开附件失败'))}>{attachment.name}<small>{bytesLabel(attachment.size)}</small></button>
          <button type="button" className="icon-btn small" disabled={busy} title="删除附件" onClick={() => void remove(attachment.id)}><span className="material-icons">close</span></button>
        </div>
      ))}
      {error && <div className="settings-error">{error}</div>}
    </div>
  )
}
