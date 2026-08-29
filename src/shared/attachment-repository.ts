import { randomUUID } from 'node:crypto'
import type { DB } from './db'
import type { Attachment, CreateAttachmentInput } from './types'

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

function rowToAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as string,
    ownerKind: row.owner_kind as Attachment['ownerKind'],
    ownerId: row.owner_id as string,
    name: row.name as string,
    mimeType: row.mime_type as string,
    size: row.size as number,
    createdAt: row.created_at as string
  }
}

export class AttachmentRepository {
  constructor(private readonly db: DB, private readonly ownerExists: (kind: Attachment['ownerKind'], id: string) => boolean) {}

  list(ownerKind: Attachment['ownerKind'], ownerId: string): Attachment[] {
    return (this.db.prepare('SELECT id, owner_kind, owner_id, name, mime_type, size, created_at FROM attachments WHERE owner_kind = ? AND owner_id = ? ORDER BY created_at').all(ownerKind, ownerId) as Record<string, unknown>[]).map(rowToAttachment)
  }

  create(input: CreateAttachmentInput): Attachment {
    const ownerId = input.ownerId.trim()
    if (!ownerId || !this.ownerExists(input.ownerKind, ownerId)) throw new Error(`${input.ownerKind === 'event' ? '日程' : '任务'}不存在，无法添加附件`)
    const name = input.name.trim().slice(0, 160) || '附件'
    const mimeType = input.mimeType.trim().slice(0, 120) || 'application/octet-stream'
    const content = Buffer.from(input.contentBase64, 'base64')
    if (!content.length || content.length > MAX_ATTACHMENT_BYTES) throw new Error('附件大小需在 1 B 到 8 MB 之间')
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    this.db.prepare('INSERT INTO attachments (id, owner_kind, owner_id, name, mime_type, size, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.ownerKind, ownerId, name, mimeType, content.length, content, createdAt)
    return this.list(input.ownerKind, ownerId).find((attachment) => attachment.id === id)!
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id).changes > 0
  }

  deleteForOwner(ownerKind: Attachment['ownerKind'], ownerId: string): void {
    this.db.prepare('DELETE FROM attachments WHERE owner_kind = ? AND owner_id = ?').run(ownerKind, ownerId)
  }

  getContent(id: string): { attachment: Attachment; content: Buffer } | null {
    const row = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? { attachment: rowToAttachment(row), content: row.content as Buffer } : null
  }
}
