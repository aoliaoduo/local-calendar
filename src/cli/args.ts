import { CliError } from './errors'

export type Flags = Record<string, string | true>

const SHORT_TO_LONG: Record<string, string> = {
  h: 'help', s: 'start', e: 'end', c: 'calendar', l: 'location', n: 'note', d: 'due',
  f: 'from', t: 'to', r: 'repeat', p: 'priority', o: 'out', i: 'in'
}

const VALUE_FLAGS = new Set(['start', 'end', 'calendar', 'location', 'note', 'due', 'from', 'to', 'title', 'repeat', 'remind', 'priority', 'out', 'in', 'data-dir', 'parent', 'color'])
const BOOL_FLAGS = new Set(['all-day', 'all', 'done', 'today', 'overdue', 'scheduled', 'json', 'help'])

export function parseArgs(argv: string[]): { flags: Flags; positional: string[] } {
  const flags: Flags = {}
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      if (BOOL_FLAGS.has(key)) flags[key] = true
      else if (VALUE_FLAGS.has(key)) flags[key] = argv[++i] ?? ''
      else throw new CliError(`未知选项: ${arg}（localcal help 查看用法）`)
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = SHORT_TO_LONG[arg.slice(1)]
      if (!key) throw new CliError(`未知选项: ${arg}（localcal help 查看用法）`)
      if (BOOL_FLAGS.has(key)) flags[key] = true
      else flags[key] = argv[++i] ?? ''
    } else {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

export function str(flags: Flags, key: string): string | undefined {
  const value = flags[key]
  return typeof value === 'string' && value ? value : undefined
}
