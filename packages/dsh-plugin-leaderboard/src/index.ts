/**
 * @dsh-external/dsh-plugin-leaderboard — host half.
 *
 * Counts every dispatched tool invocation through the `tools/result` event
 * (the same frozen-outcome signal the built-in `agent-instructions` plugin
 * observes), attributes each tool name to an owning plugin through a curated
 * default map plus a user-editable override file, persists the running totals
 * under `~/.dsh/plugin-leaderboard/counts.json`, and serves the aggregated
 * ranking over a small HTTP API for the client panel.
 */
import type { Context } from 'cordis'
// Type-only: pulls the `tools/result` Context Events augmentation into the
// program so `ctx.on('tools/result', …)` type-checks.
import type {} from '@deepseek-ai/dsh-tools'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const name = '@dsh-external/dsh-plugin-leaderboard'
export const inject = ['webServer']

const SHORT = 'dsh-plugin-leaderboard'

/**
 * Curated tool-name → plugin label for the built-in tools that actually run in
 * the web profile. This is a starting attribution, not an exhaustive registry:
 * anything not listed here (including custom injected plugins) falls under
 * "(unattributed)" and can be declared in `~/.dsh/plugin-leaderboard/attributes.json`.
 */
const DEFAULT_ATTRIBUTES: Record<string, string> = {
  read: 'tool-fs (read)',
  write: 'tool-fs (write)',
  edit: 'str-replace-editor (edit)',
  glob: 'tool-fs-search (glob)',
  grep: 'tool-fs-search (grep)',
  bash: 'tool-bash (bash)',
  web_search: 'web-search-deepseek',
  web_fetch: 'tool-web',
  todo_write: 'tool-todo',
  ask_user_question: 'tool-ask-user',
  subagent: 'tool-subagent',
  subagent_fork: 'tool-subagent',
  list_agents: 'tool-subagent-control',
  send_message: 'tool-subagent-control',
  interrupt_agent: 'tool-subagent-control',
  workflow: 'tool-workflow',
  ralph: 'tool-ralph',
  create_goal: 'tool-goal (goal)',
  get_goal: 'tool-goal (goal)',
  update_goal: 'tool-goal (goal)',
  skill: 'tool-skill',
  job_list: 'tool-jobs (jobs)',
  job_output: 'tool-jobs (jobs)',
  job_kill: 'tool-jobs (jobs)',
  dev_inject_plugin: 'dsh-super-injector',
  dev_uninject_plugin: 'dsh-super-injector',
  dev_reload_package: 'dsh-super-injector',
  dev_plugin_status: 'dsh-super-injector',
  dev_scaffold_plugin: 'dsh-super-injector',
  dev_build_plugin: 'dsh-super-injector',
  dev_self_test: 'dsh-super-injector',
  dev_stage_add: 'dsh-super-injector',
  dev_stage_call: 'dsh-super-injector',
  dev_stage_list: 'dsh-super-injector',
  dev_stage_promote: 'dsh-super-injector',
  dev_stage_demote: 'dsh-super-injector',
}

/** Home directory the plugin owns for its state files. */
function stateDir(): string {
  return join(homedir(), '.dsh', SHORT)
}

/** Load tool → plugin overrides, layered on top of the curated defaults. */
function loadAttributes(): Record<string, string> {
  const file = join(stateDir(), 'attributes.json')
  try {
    const extra: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (extra !== null && typeof extra === 'object' && !Array.isArray(extra)) {
      return { ...DEFAULT_ATTRIBUTES, ...(extra as Record<string, string>) }
    }
  } catch { /* missing or malformed overrides keep the curated defaults */ }
  return { ...DEFAULT_ATTRIBUTES }
}

/** Load persisted per-tool totals, if any. */
function loadCounts(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(stateDir(), 'counts.json'), 'utf8'))
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const tools = (raw as { tools?: unknown }).tools
      if (tools !== null && typeof tools === 'object' && !Array.isArray(tools)) {
        return tools as Record<string, number>
      }
    }
  } catch { /* first run: no persisted totals yet */ }
  return {}
}

export function apply(ctx: Context): void {
  const anyCtx = ctx as any
  const toolCounts: Record<string, number> = loadCounts()
  const attributes = loadAttributes()
  const countsFile = join(stateDir(), 'counts.json')

  const persist = (): void => {
    try {
      mkdirSync(dirname(countsFile), { recursive: true })
      writeFileSync(countsFile, JSON.stringify({ tools: toolCounts, updatedAt: Date.now() }))
    } catch { /* persistence is best-effort; counting still works in memory */ }
  }

  // Count one invocation per settled tool execution. The listener binds to this
  // plugin's fiber, so unloading the plugin stops counting and removes the hook.
  ctx.on('tools/result', (exec: { name?: unknown }) => {
    const tool = typeof exec?.name === 'string' ? exec.name : ''
    if (tool === '') return
    toolCounts[tool] = (toolCounts[tool] ?? 0) + 1
  })

  // Periodic flush so totals survive a crash; the API also flushes on read.
  const persistTimer = setInterval(persist, 10_000)
  ctx.effect(() => () => clearInterval(persistTimer), '@dsh-external/dsh-plugin-leaderboard: persist timer')

  /** Read a JSON request body (mirrors the reference-upload host helper). */
  const readJsonBody = (req: any): Promise<any> => new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(Buffer.from(chunk)) })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })

  ctx.effect(() => anyCtx.webServer.register({
    kind: 'prefix',
    path: '/@dsh-external/dsh-plugin-leaderboard/api',
    handler: async (req: any, res: any) => {
      if (req.method === 'POST') {
        // Self-report endpoint: any plugin (including non-tool plugins such as
        // file-upload) attributes one of its counters to itself and bumps it.
        // Body: { plugin: string, tool: string }.
        let payload: any
        try {
          payload = await readJsonBody(req)
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('body is not JSON')
          return
        }
        const plugin = typeof payload?.plugin === 'string' ? payload.plugin.trim() : ''
        const tool = typeof payload?.tool === 'string' ? payload.tool.trim() : ''
        if (plugin === '' || tool === '') {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('missing plugin/tool')
          return
        }
        attributes[tool] = plugin
        toolCounts[tool] = (toolCounts[tool] ?? 0) + 1
        persist()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, plugin, tool, total: toolCounts[tool] }))
        return
      }
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('method not allowed')
        return
      }
      const byPlugin = new Map<string, { total: number; tools: Record<string, number> }>()
      for (const [tool, count] of Object.entries(toolCounts)) {
        if (typeof count !== 'number' || count <= 0) continue
        const plugin = attributes[tool] ?? '(unattributed)'
        let entry = byPlugin.get(plugin)
        if (entry === undefined) {
          entry = { total: 0, tools: {} }
          byPlugin.set(plugin, entry)
        }
        entry.total += count
        entry.tools[tool] = count
      }
      const ranking = [...byPlugin.entries()]
        .map(([plugin, value]) => ({ plugin, total: value.total, tools: value.tools }))
        .sort((left, right) => right.total - left.total || left.plugin.localeCompare(right.plugin))
      persist()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        updatedAt: Date.now(),
        totalCalls: Object.values(toolCounts).reduce<number>((sum, count) => sum + (typeof count === 'number' ? count : 0), 0),
        ranking,
      }))
    },
  }), '@dsh-external/dsh-plugin-leaderboard: leaderboard api')

  ctx.logger?.info?.('[@dsh-external/dsh-plugin-leaderboard] counting tool invocations; API at /@dsh-external/dsh-plugin-leaderboard/api/leaderboard')
}
