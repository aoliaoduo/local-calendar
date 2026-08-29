import Database from 'better-sqlite3'
import { getDbPath } from './paths'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  is_all_day INTEGER NOT NULL DEFAULT 0,
  color_override TEXT,
  rrule TEXT,
  exdates TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'confirmed',
  reminders TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_utc, end_utc);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  notes TEXT,
  due_at TEXT,
  reminder_minutes INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  rrule TEXT,
  exdates TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'needsAction',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);
`

export function openDatabase(): DB {
  const db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrateSchema(db)
  seedDefaultData(db)
  return db
}

function migrateSchema(db: DB): void {
  const eventColumns = db.prepare('PRAGMA table_info(events)').all() as { name: string }[]
  if (!eventColumns.some((column) => column.name === 'reminders')) {
    db.exec("ALTER TABLE events ADD COLUMN reminders TEXT NOT NULL DEFAULT '[]'")
  }
  if (!eventColumns.some((column) => column.name === 'exdates')) {
    db.exec("ALTER TABLE events ADD COLUMN exdates TEXT NOT NULL DEFAULT '[]'")
  }
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
  if (!taskColumns.some((column) => column.name === 'reminder_minutes')) {
    db.exec('ALTER TABLE tasks ADD COLUMN reminder_minutes INTEGER')
  }
  if (!taskColumns.some((column) => column.name === 'rrule')) {
    db.exec('ALTER TABLE tasks ADD COLUMN rrule TEXT')
  }
  if (!taskColumns.some((column) => column.name === 'priority')) {
    db.exec('ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0')
  }
  if (!taskColumns.some((column) => column.name === 'sort_order')) {
    db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
  }
  if (!taskColumns.some((column) => column.name === 'exdates')) {
    db.exec("ALTER TABLE tasks ADD COLUMN exdates TEXT NOT NULL DEFAULT '[]'")
  }
  if (!taskColumns.some((column) => column.name === 'parent_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id)')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)')
}

function seedDefaultData(db: DB): void {
  const now = new Date().toISOString()
  const insert = db.prepare(
    'INSERT INTO calendars (id, name, color, is_primary, is_visible, time_zone, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)'
  )
  const exists = (id: string): boolean =>
    !!db.prepare('SELECT 1 FROM calendars WHERE id = ?').get(id)
  const ensure = (id: string, name: string, color: string, isPrimary: number): void => {
    if (!exists(id)) insert.run(id, name, color, isPrimary, 'Asia/Shanghai', now, now)
  }
  ensure('personal', '个人', '#1a73e8', 1)
  ensure('work', '工作', '#0b8043', 0)
  ensure('family', '家庭', '#8e24aa', 0)
  ensure('holidays', '中国节假日', '#2e7d32', 0)
}
