/**
 * @dsh-external/dsh-skill-inspector — client half.
 *
 * A 📚 button in the composer dock that opens a read-only panel listing every
 * local skill: which root it lives in, whether its frontmatter is valid
 * (kebab-case name matching the dir + non-empty description), and its
 * description preview. Follows the proven dock-entry pattern (component as the
 * second register argument; no `useInput` call).
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, useCallback, useEffect, useState } from 'react'

type ClientContext = {
  slots: SlotsService
}

export const inject = ['slots']

const API_BASE = '/@dsh-external/dsh-skill-inspector/api/skills'

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

interface SkillsReport {
  updatedAt: number
  total: number
  validCount: number
  roots: RootReport[]
}

const PANEL_STYLE: Record<string, string | number> = {
  position: 'fixed',
  right: '16px',
  bottom: '96px',
  width: '360px',
  maxHeight: '440px',
  overflow: 'auto',
  background: 'var(--dsw-bg-elevated, #1e1f22)',
  border: '1px solid var(--dsw-border, #333)',
  borderRadius: '10px',
  boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
  padding: '12px',
  zIndex: 1000,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '12px',
  color: 'var(--dsw-text, #e6e6e6)',
}

const MUTED: Record<string, string | number> = { color: 'var(--dsw-text-muted, #9a9a9a)' }
const OK: Record<string, string | number> = { color: '#2a2' }
const BAD: Record<string, string | number> = { color: '#d33' }

function SkillInspectorButton(_props: unknown): ReturnType<typeof createElement> {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<SkillsReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(API_BASE, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setReport(await response.json() as SkillsReport)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const button = createElement('button', {
    type: 'button',
    title: 'Skills 检查器（本地技能清单与 frontmatter 校验）',
    onClick: () => setOpen(value => !value),
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 16,
      lineHeight: 1,
      padding: '4px 6px',
      opacity: 0.85,
    },
  }, '📚')

  if (!open) return button

  const renderSkill = (skill: SkillEntry): ReturnType<typeof createElement> => {
    const badge = skill.valid
      ? createElement('span', { style: OK }, '✓')
      : createElement('span', { style: BAD }, '✗')
    const warnings = skill.warnings.length === 0
      ? null
      : createElement('div', { style: { paddingLeft: 14, ...BAD } }, skill.warnings.join('；'))
    const desc = skill.description === ''
      ? null
      : createElement('div', { style: { paddingLeft: 14, ...MUTED } }, skill.description)
    return createElement('div', { key: skill.dir, style: { marginBottom: 6 } },
      createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
        createElement('span', null, `${skill.name ?? skill.dir}`),
        badge,
      ),
      warnings,
      desc,
    )
  }

  const body = report === null
    ? (error === null ? createElement('div', { style: MUTED }, '加载中…') : createElement('div', { style: BAD }, error))
    : report.total === 0
      ? createElement('div', { style: MUTED }, '没有找到任何技能（~/.dsh/skills 为空？）')
      : report.roots.map(root => {
        if (!root.exists) return null
        const skills = root.skills.map(renderSkill)
        return createElement('div', { key: root.path },
          createElement('div', { style: { margin: '8px 0 4px', ...MUTED } }, root.label),
          ...skills,
        )
      })

  const panel = createElement('div', { style: PANEL_STYLE },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
      createElement('strong', null, 'Skills 检查器'),
      createElement('button', {
        type: 'button',
        onClick: () => setOpen(false),
        style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'inherit' },
      }, '✕'),
    ),
    createElement('div', { style: { ...MUTED, marginBottom: 8 } },
      report === null ? '只读检查 · 不修改任何文件' : `共 ${report.total} 个技能 · ${report.validCount} 个有效`,
    ),
    body,
    createElement('div', { style: { marginTop: 8, ...MUTED } },
      '技能是 Markdown 数据，由 skill + skill-filesystem + tool-skill + ui-skill 插件协作加载；这里直接读磁盘目录。',
    ),
  )

  return createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 2 } },
    button,
    panel,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: '@dsh-external/dsh-skill-inspector',
      order: 8,
    }, SkillInspectorButton),
  ), '@dsh-external/dsh-skill-inspector: inspector button')
}
