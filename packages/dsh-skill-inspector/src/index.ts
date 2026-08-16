/**
 * @dsh-external/dsh-skill-inspector — host half.
 *
 * Reads the skill roots the `skill-filesystem` provider scans (user roots
 * `~/.dsh/skills` and `~/.agents/skills`), parses each `SKILL.md` frontmatter,
 * validates the fields the model catalog depends on (kebab-case `name` matching
 * the directory, non-empty `description`), and serves the result over a small
 * HTTP API for the client panel. Read-only: it never modifies skills.
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from 'cordis'

export const name = '@dsh-external/dsh-skill-inspector'
export const inject = ['webServer']

const SHORT = 'dsh-skill-inspector'

/** Roots scanned by `@deepseek-ai/dsh-skill-filesystem` (user layer). */
const ROOTS: ReadonlyArray<{ path: string; label: string }> = [
  { path: join(homedir(), '.dsh', 'skills'), label: '~/.dsh/skills（user-dsh，主要目录）' },
  { path: join(homedir(), '.agents', 'skills'), label: '~/.agents/skills（user-agents，跨 agent 共享）' },
]

/** Frontmatter keys the catalog reads; anything else is ignored for validation. */
interface Frontmatter {
  name?: string
  description?: string
  'user-invocable'?: string
  /** CamelCase typo that silently drops the whole skill (documented fail-closed behavior). */
  userInvocable?: string
}

/** Minimal YAML-frontmatter parser for scalar fields with indented continuations. */
function parseFrontmatter(text: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) return {}
  const out: Frontmatter = {}
  let key: keyof Frontmatter | null = null
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (kv !== null) {
      key = kv[1] as keyof Frontmatter
      const value = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2')
      out[key] = value
    } else if (key !== null && /^\s+\S/.test(line)) {
      out[key] = `${out[key] ?? ''}\n${line.trim()}`
    }
  }
  return out
}

/** The catalog requires kebab-case names that match the containing directory. */
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/

interface SkillEntry {
  dir: string
  name: string | undefined
  description: string
  valid: boolean
  warnings: string[]
}

interface RootReport {
  path: string
  label: string
  exists: boolean
  skills: SkillEntry[]
}

async function inspectRoot(root: { path: string; label: string }): Promise<RootReport> {
  const report: RootReport = { path: root.path, label: root.label, exists: false, skills: [] }
  if (!existsSync(root.path)) return report
  report.exists = true
  let entries: string[] = []
  try {
    entries = await readdir(root.path, { withFileTypes: true })
      .then(list => list.filter(e => e.isDirectory()).map(e => e.name))
  } catch { return report }
  for (const dir of entries.sort()) {
    const skillFile = join(root.path, dir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    let text = ''
    try {
      text = await readFile(skillFile, 'utf8')
    } catch { continue }
    const meta = parseFrontmatter(text)
    const warnings: string[] = []
    const name = meta.name?.trim()
    if (name === undefined || name === '') {
      warnings.push('frontmatter 缺少 name（必填）')
    } else if (!KEBAB_CASE.test(name)) {
      warnings.push(`name "${name}" 不是 kebab-case（必须小写+连字符，否则整个技能被丢弃）`)
    } else if (name !== dir) {
      warnings.push(`name "${name}" 与目录名 "${dir}" 不一致（必须同名）`)
    }
    if (meta.userInvocable !== undefined) {
      warnings.push('检测到驼峰 userInvocable——会导致整个文件被丢弃，应写 user-invocable')
    }
    const description = (meta.description ?? '').trim()
    if (description === '') {
      warnings.push('frontmatter 缺少 description（必填，决定模型何时想起它）')
    }
    report.skills.push({
      dir,
      name,
      description: description.split('\n')[0].slice(0, 120),
      valid: warnings.length === 0,
      warnings,
    })
  }
  return report
}

export function apply(ctx: Context): void {
  const anyCtx = ctx as any
  ctx.effect(() => anyCtx.webServer.register({
    kind: 'prefix',
    path: '/@dsh-external/dsh-skill-inspector/api',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('method not allowed')
        return
      }
      const roots: RootReport[] = []
      for (const root of ROOTS) roots.push(await inspectRoot(root))
      const all = roots.flatMap(root => root.skills)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        updatedAt: Date.now(),
        total: all.length,
        validCount: all.filter(skill => skill.valid).length,
        roots,
      }))
    },
  }), '@dsh-external/dsh-skill-inspector: skills api')

  ctx.logger?.info?.('[@dsh-external/dsh-skill-inspector] API at /@dsh-external/dsh-skill-inspector/api/skills')
}
