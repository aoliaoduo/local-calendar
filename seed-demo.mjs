import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const info = JSON.parse(readFileSync(join(process.env.APPDATA, 'local-calendar', 'rpc.json'), 'utf-8'))

async function call(method, params) {
  const res = await fetch(`http://127.0.0.1:${info.port}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
    body: JSON.stringify({ method, params })
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error)
  return json.data
}

const events = [
  { title: '每日站会', start: '2026-08-28T09:00:00', end: '2026-08-28T09:30:00', calendarId: 'work', colorOverride: '#039be5' },
  { title: '季度项目评审', start: '2026-08-28T11:00:00', end: '2026-08-28T12:30:00', calendarId: 'work', colorOverride: '#f4511e', description: '评审 Q3 进度与风险' },
  { title: '和产品经理 1:1', start: '2026-08-28T14:00:00', end: '2026-08-28T15:00:00', calendarId: 'work' },
  { title: '牙医复诊', start: '2026-08-28T16:30:00', end: '2026-08-28T17:30:00', calendarId: 'personal', colorOverride: '#8e24aa', location: '和睦家口腔' },
  { title: '健身房 · 腿部日', start: '2026-08-28T19:00:00', end: '2026-08-28T20:30:00', calendarId: 'personal', colorOverride: '#0b8043' },
  { title: '朋友生日聚会', start: '2026-08-29', calendarId: 'family', colorOverride: '#d50000', isAllDay: true },
  { title: '设计评审会', start: '2026-08-27T15:00:00', end: '2026-08-27T16:00:00', calendarId: 'work', colorOverride: '#f9ab00' },
  { title: '家庭聚餐', start: '2026-08-26T18:00:00', end: '2026-08-26T20:00:00', calendarId: 'family', colorOverride: '#8e24aa' },
  { title: '写周报', start: '2026-08-31T16:00:00', end: '2026-08-31T17:00:00', calendarId: 'work' }
]

const tasks = [
  { title: '回复客户邮件', dueAt: '2026-08-28' },
  { title: '准备下周一的演示文稿', dueAt: '2026-08-30', notes: '重点讲架构方案' },
  { title: '给团队订会议室', dueAt: '2026-09-02' }
]

for (const e of events) await call('events.create', e)
for (const t of tasks) await call('tasks.create', t)
console.log('demo data seeded')
