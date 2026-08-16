/**
 * @dsh-external/dsh-plugin-leaderboard — client half.
 *
 * Registers a 「排行榜」 entry in Web Settings (the `settings.section` slot,
 * alongside General / Models / Plugins), showing the plugin usage ranking
 * served by the host half. Read-only; refreshes on mount and via a refresh
 * button. The Settings → Plugins page itself is currently broken in the
 * installed build (pre-existing crash), so this section is a separate entry.
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

const CONTAINER: Record<string, string | number> = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '13px',
  color: 'var(--dsw-text, #e6e6e6)',
  padding: '4px 0',
}

const MUTED: Record<string, string | number> = { color: 'var(--dsw-text-muted, #9a9a9a)' }
const ROW: Record<string, string | number> = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0' }
const BAR_TRACK: Record<string, string | number> = { height: '6px', background: 'var(--dsw-border, #333)', borderRadius: '3px', marginBottom: '2px' }
const BAR: Record<string, string | number> = { height: '6px', background: 'var(--dsw-accent, #4d7cfe)', borderRadius: '3px' }

function LeaderboardSection(props: any): ReturnType<typeof createElement> {
  const [data, setData] = useState<Leaderboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const response = await fetch(API_BASE, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setData(await response.json() as Leaderboard)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const header = createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
    createElement('strong', null, '插件使用频率排行榜'),
    createElement('span', { style: { display: 'inline-flex', gap: 6 } },
      createElement('button', {
        type: 'button',
        onClick: () => void load(),
        style: {
          padding: '3px 12px',
          border: '1px solid var(--dsw-border, #444)',
          borderRadius: '999px',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 12,
          color: 'inherit',
        },
      }, '刷新'),
      typeof props?.close === 'function'
        ? createElement('button', {
          type: 'button',
          onClick: () => props.close(),
          style: {
            padding: '3px 12px',
            border: '1px solid var(--dsw-border, #444)',
            borderRadius: '999px',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            color: 'inherit',
          },
        }, '关闭')
        : null,
    ),
  )

  let body: ReturnType<typeof createElement>
  if (error !== null) {
    body = createElement('div', { style: { color: '#d33' } }, `加载失败：${error}`)
  } else if (data === null) {
    body = createElement('div', { style: MUTED }, '加载中…')
  } else if (data.ranking.length === 0) {
    body = createElement('div', { style: MUTED }, '还没有工具调用记录——开始使用 DSH 后这里会出现排名。')
  } else {
    const max = data.ranking[0]?.total ?? 1
    body = createElement('div', null,
      ...data.ranking.map((row, index) => {
        const tools = Object.entries(row.tools)
          .sort((left, right) => right[1] - left[1])
          .map(([tool, count]) =>
            createElement('div', { key: tool, style: { paddingLeft: 16, ...MUTED } }, `${tool} · ${count}`))
        return createElement('div', { key: row.plugin, style: { marginBottom: 10 } },
          createElement('div', { style: ROW },
            createElement('span', null, `${index + 1}. ${row.plugin}`),
            createElement('span', null, String(row.total)),
          ),
          createElement('div', { style: BAR_TRACK },
            createElement('div', { style: { ...BAR, width: `${Math.max(2, Math.round((row.total / max) * 100))}%` } }),
          ),
          ...tools,
        )
      }),
    )
  }

  const footer = createElement('div', { style: { marginTop: 12, ...MUTED } },
    data === null
      ? '统计口径：tools/result 事件，按工具归属插件聚合'
      : `累计 ${data.totalCalls} 次工具调用 · 更新于 ${new Date(data.updatedAt).toLocaleTimeString()} · 数据存于 ~/.dsh/plugin-leaderboard/`,
  )

  return createElement('div', { style: CONTAINER },
    header,
    body,
    footer,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'leaderboard',
      order: 20,
      label: () => '排行榜',
    }, LeaderboardSection),
  ), '@dsh-external/dsh-plugin-leaderboard: settings leaderboard section')
}
