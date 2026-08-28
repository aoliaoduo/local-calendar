import { useState } from 'react'
import { DateTime } from 'luxon'
import { api, type CalendarInfo, type EventInfo, type ReminderInfo } from '../api'

export const EVENT_PALETTE = [
  '#d50000',
  '#e67c73',
  '#f4511e',
  '#f9ab00',
  '#0b8043',
  '#039be5',
  '#3f51b5',
  '#7986cb',
  '#8e24aa',
  '#616161'
]

export type DialogState =
  | { mode: 'create'; day: DateTime; hour?: number; allDay?: boolean; start?: DateTime; end?: DateTime }
  | { mode: 'edit'; event: EventInfo }
  | null

interface EventDialogProps {
  state: DialogState
  calendars: CalendarInfo[]
  onClose: () => void
  onSaved: (message: string) => void
}

const REPEAT_OPTIONS = [
  { value: '', label: '不重复' },
  { value: 'DAILY', label: '每天' },
  { value: 'WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: '工作日（周一至周五）' },
  { value: 'WEEKLY', label: '每周' },
  { value: 'MONTHLY', label: '每月' },
  { value: 'YEARLY', label: '每年' }
]

const REMINDER_OPTIONS = [
  { minutes: 0, label: '日程开始时' },
  { minutes: 5, label: '提前 5 分钟' },
  { minutes: 10, label: '提前 10 分钟' },
  { minutes: 15, label: '提前 15 分钟' },
  { minutes: 30, label: '提前 30 分钟' },
  { minutes: 60, label: '提前 1 小时' },
  { minutes: 120, label: '提前 2 小时' },
  { minutes: 1440, label: '提前 1 天' }
]

function reminderLabel(minutes: number): string {
  return REMINDER_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `提前 ${minutes} 分钟`
}

function normalizeReminders(reminders: ReminderInfo[] | undefined): ReminderInfo[] {
  const unique = new Map<number, ReminderInfo>()
  for (const reminder of reminders ?? []) {
    if (Number.isInteger(reminder.minutes) && reminder.minutes >= 0) unique.set(reminder.minutes, { minutes: reminder.minutes, method: 'popup' })
  }
  return [...unique.values()].sort((first, second) => second.minutes - first.minutes)
}

function repeatValue(rrule: string | null | undefined): string {
  if (!rrule) return ''
  const exact = REPEAT_OPTIONS.find((o) => o.value === rrule)
  if (exact) return exact.value
  const stripped = rrule.split(';').filter((p) => !/^(INTERVAL|UNTIL|COUNT)=/i.test(p)).join(';')
  return REPEAT_OPTIONS.some((o) => o.value === stripped) ? stripped : rrule
}

function toLocalInput(utcIso: string, allDay: boolean): string {
  const dt = DateTime.fromISO(utcIso)
  return allDay ? dt.toFormat('yyyy-MM-dd') : dt.toFormat("yyyy-MM-dd'T'HH:mm")
}

export default function EventDialog({ state, calendars, onClose, onSaved }: EventDialogProps) {
  const editing = state?.mode === 'edit'
  const existing = editing ? state.event : null

  const initStart = existing
    ? DateTime.fromISO(existing.startUtc)
    : state?.mode === 'create'
      ? state.start ?? state.day.startOf('day').plus({ hours: state.hour ?? Math.min(23, DateTime.now().hour + 1) })
      : DateTime.now()
  const initEnd = existing
    ? DateTime.fromISO(existing.endUtc)
    : state?.mode === 'create' && state.end ? state.end : initStart.plus({ hours: 1 })
  const initAllDay = existing ? existing.isAllDay : (state?.mode === 'create' ? !!state.allDay : false)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [allDay, setAllDay] = useState(initAllDay)
  const [start, setStart] = useState(toLocalInput(initStart.toUTC().toISO()!, initAllDay))
  const [end, setEnd] = useState(toLocalInput(initEnd.toUTC().toISO()!, initAllDay))
  const [calendarId, setCalendarId] = useState(existing?.calendarId ?? calendars[0]?.id ?? 'personal')
  const [color, setColor] = useState(existing?.colorOverride ?? null)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [repeat, setRepeat] = useState(repeatValue(existing?.rrule))
  const [reminders, setReminders] = useState<ReminderInfo[]>(() => normalizeReminders(existing?.reminders))
  const [reminderMinutes, setReminderMinutes] = useState(String(10))
  const [error, setError] = useState('')

  if (!state) return null

  const buildTime = (value: string, ref: DateTime): string => {
    const dt = allDay ? DateTime.fromISO(value).startOf('day') : DateTime.fromISO(value)
    if (!dt.isValid) throw new Error('时间格式无效')
    return dt.setZone(ref.zone).toUTC().toISO()!
  }

  const handleSave = async () => {
    try {
      const startUtc = buildTime(start, initStart)
      const endUtc = allDay
        ? buildTime(start, initStart).replace('T00:00:00.000Z', 'T23:59:59.999Z')
        : buildTime(end, initEnd)
      if (!allDay && endUtc <= startUtc) {
        setError('结束时间需晚于开始时间')
        return
      }
      if (editing) {
        await api.updateEvent(existing!.id, {
          title: title.trim() || '（无标题）',
          start: startUtc,
          end: endUtc,
          isAllDay: allDay,
          calendarId,
          colorOverride: color,
          description: description || null,
          location: location || null,
          rrule: repeat || null,
          reminders
        })
        onSaved('已保存修改')
      } else {
        await api.createEvent({
          title: title.trim() || '（无标题）',
          start: startUtc,
          end: endUtc,
          isAllDay: allDay,
          calendarId,
          colorOverride: color,
          description: description || null,
          location: location || null,
          rrule: repeat || null,
          reminders
        })
        onSaved('已创建日程')
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    await api.deleteEvent(existing!.id)
    onSaved('已删除日程')
    onClose()
  }

  const toggleAllDay = (v: boolean) => {
    setAllDay(v)
    setStart(toLocalInput(DateTime.fromISO(start).toISO()!, v))
    if (!v) {
      const s = DateTime.fromISO(start)
      const e = DateTime.fromISO(end)
      if (!e.isValid || !e.hasSame(s, 'day')) setEnd(s.plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm"))
    }
  }

  const addReminder = () => {
    const minutes = Number(reminderMinutes)
    if (!Number.isInteger(minutes) || minutes < 0 || reminders.some((reminder) => reminder.minutes === minutes)) return
    const reminder: ReminderInfo = { minutes, method: 'popup' }
    setReminders((current) => [...current, reminder].sort((first, second) => second.minutes - first.minutes))
  }

  return (
    <div className="dlg-mask" onMouseDown={onClose}>
      <div className="dlg" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="dlg-title"
          placeholder="添加标题"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
          }}
        />

        <div className="dlg-row">
          <span className="material-icons">schedule</span>
          <div className="fill" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="time-inputs">
              {allDay ? (
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              ) : (
                <>
                  <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                  <span className="sep">–</span>
                  <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                </>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-2)' }}>
              <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
              全天
            </label>
          </div>
        </div>

        <div className="dlg-row">
          <span className="material-icons">event_repeat</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className="fill">
            {REPEAT_OPTIONS.some((o) => o.value === repeat) ? null : (
              <option value={repeat}>{repeat}</option>
            )}
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {repeat && (
            <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', paddingLeft: 8 }}>
              作用于整个系列
            </span>
          )}
        </div>

        <div className="dlg-row reminder-row">
          <span className="material-icons">notifications</span>
          <div className="fill reminder-controls">
            {reminders.map((reminder) => (
              <div className="reminder-chip" key={reminder.minutes}>
                <span>{reminderLabel(reminder.minutes)}</span>
                <button
                  type="button"
                  aria-label={`删除${reminderLabel(reminder.minutes)}提醒`}
                  onClick={() => setReminders((current) => current.filter((item) => item.minutes !== reminder.minutes))}
                >
                  <span className="material-icons">close</span>
                </button>
              </div>
            ))}
            <div className="reminder-add">
              <select value={reminderMinutes} onChange={(e) => setReminderMinutes(e.target.value)}>
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.minutes} value={option.minutes}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-text" onClick={addReminder} disabled={reminders.some((reminder) => reminder.minutes === Number(reminderMinutes))}>
                添加
              </button>
            </div>
          </div>
        </div>

        <div className="dlg-row">
          <span className="material-icons">place</span>
          <input className="fill" type="text" placeholder="添加地点" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <div className="dlg-row">
          <span className="material-icons">notes</span>
          <textarea className="fill" placeholder="添加说明" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="dlg-row">
          <span className="material-icons">calendar_today</span>
          <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="fill">
            {calendars.filter((c) => c.id !== 'holidays').map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="dlg-row">
          <span className="material-icons">palette</span>
          <div className="color-row fill">
            {EVENT_PALETTE.map((hex) => (
              <div
                key={hex}
                className={`color-swatch${color === hex ? ' selected' : ''}`}
                style={{ background: hex }}
                onClick={() => setColor(color === hex ? null : hex)}
              />
            ))}
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 0 4px 40px' }}>{error}</div>
        )}

        <div className="dlg-actions">
          <div className="left">
            {editing && (
              <button className="btn-text danger" onClick={() => void handleDelete()}>
                删除
              </button>
            )}
          </div>
          <div className="right">
            <button className="btn-text" onClick={onClose}>
              取消
            </button>
            <button className="btn-text" onClick={() => void handleSave()}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
