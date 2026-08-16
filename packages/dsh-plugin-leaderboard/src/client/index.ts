/**
 * @dsh-external/dsh-plugin-leaderboard — client half.
 *
 * A small button in the composer dock that opens a fixed-position panel showing
 * the plugin usage leaderboard served by the host half. The panel is plain
 * React `createElement` (no JSX, matching the reference-upload pattern) and
 * re-fetches the ranking every time it opens plus on an explicit refresh.
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, useCallback, useEffect, useState } from 'react'

type ClientContext = {
  slots: SlotsService
}

export const inject = ['slots']

const API_BASE = '/@dsh-external/dsh-plugin-leaderboard/api/leaderboard'

interface RankRow {
  plugin: string
  total: number
  tools: Record<string, number>
}

interface Leaderboard {
  updatedAt: number
  totalCalls: number
  ranking: RankRow[]
}

const PANEL_STYLE: Record<string, string | number> = {
  position: 'fixed',
  right: '16px',
  bottom: '96px',
  width: '340px',
  maxHeight: '420px',
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
const ROW: Record<string, string | number> = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0' }
const BAR: Record<string, string | number> = { height: '6px', background: 'var(--dsw-accent, #4d7cfe)', borderRadius: '3px' }
const BAR_TRACK: Record<string, string | number> = { height: '6px', background: 'var(--dsw-border, #333)', borderRadius: '3px', marginTop: '3px' }

function LeaderboardButton(_props: unknown): ReturnType<typeof createElement> {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Leaderboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(API_BASE, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setData(await response.json() as Leaderboard)
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
    title: '插件使用频率排行榜',
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
  }, '🏆')

  if (!open) return button

  const max = data?.ranking[0]?.total ?? 1
  const rows = data === null
    ? (error === null ? createElement('div', { style: MUTED }, '加载中…') : createElement('div', { style: { color: '#d33' } }, error))
    : data.ranking.length === 0
      ? createElement('div', { style: MUTED }, '还没有工具调用记录')
      : data.ranking.map((row, index) => {
        const tools = Object.entries(row.tools)
          .sort((left, right) => right[1] - left[1])
          .map(([tool, count]) => createElement('div', { key: tool, style: { paddingLeft: 14, ...MUTED } }, `${tool} · ${count}`))
        return createElement('div', { key: row.plugin },
          createElement('div', { style: ROW },
            createElement('span', null, `${index + 1}. ${row.plugin}`),
            createElement('span', null, String(row.total)),
          ),
          createElement('div', { style: BAR_TRACK },
            createElement('div', { style: { ...BAR, width: `${Math.max(2, Math.round((row.total / max) * 100))}%` } }),
          ),
          ...tools,
        )
      })

  const panel = createElement('div', { style: PANEL_STYLE },
    createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
      createElement('strong', null, '插件使用频率排行榜'),
      createElement('button', {
        type: 'button',
        onClick: () => setOpen(false),
        style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'inherit' },
      }, '✕'),
    ),
    createElement('div', { style: { ...MUTED, marginBottom: 8 } },
      data === null ? '按工具调用次数聚合 · 点击按钮重新打开即刷新' : `累计 ${data.totalCalls} 次工具调用 · ${new Date(data.updatedAt).toLocaleTimeString()}`,
    ),
    rows,
    createElement('div', { style: { marginTop: 8, ...MUTED } }, '统计口径：tools/result 事件，按工具归属插件聚合'),
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
      id: '@dsh-external/dsh-plugin-leaderboard',
      order: 6,
    }, LeaderboardButton),
  ), '@dsh-external/dsh-plugin-leaderboard: leaderboard button')
}
