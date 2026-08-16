/**
 * @dsh-external/dsh-file-upload — host half.
 *
 * Batch reference-upload API: saves any file type dragged or picked in the
 * browser into the current session workspace's `.dsh/references/` directory
 * and returns the workspace-relative paths, so the model reads them on demand
 * through the filesystem tools instead of receiving raw bytes in context.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { Context } from 'cordis'

export const name = '@dsh-external/dsh-file-upload'
export const inject = ['webServer', 'sessions']

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_FILES_PER_BATCH = 20

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(Buffer.from(chunk)) })
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/** Strip path components and control characters, cap the length. */
function safeFileName(name: string): string {
  const leaf = basename(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 180)
  return leaf === '' || leaf === '.' ? `reference-${Date.now()}` : leaf
}

/**
 * Write with an exclusive create flag; on a name collision append `-2`, `-3`,
 * … before the extension, so dropping two files with the same name keeps both.
 */
async function writeDeduped(dir: string, name: string, bytes: Buffer): Promise<string> {
  const safe = safeFileName(name)
  const ext = extname(safe)
  const stem = safe.slice(0, safe.length - ext.length)
  let index = 1
  for (;;) {
    const candidate = join(dir, index === 1 ? safe : `${stem}-${index}${ext}`)
    try {
      await writeFile(candidate, bytes, { flag: 'wx' })
      return candidate
    } catch (error: any) {
      if (error?.code === 'EEXIST') {
        index += 1
        continue
      }
      throw error
    }
  }
}

export function apply(ctx: Context): void {
  const anyCtx = ctx as any
  ctx.effect(() => anyCtx.webServer.register({
    kind: 'prefix',
    path: '/@dsh-external/dsh-file-upload/api',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('method not allowed')
        return
      }
      let payload: any
      try {
        payload = await readJsonBody(req)
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('body is not JSON')
        return
      }
      const { sessionId, files } = payload ?? {}
      if (typeof sessionId !== 'string' || !Array.isArray(files) || files.length === 0) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('missing sessionId/files')
        return
      }
      if (files.length > MAX_FILES_PER_BATCH) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`too many files (max ${MAX_FILES_PER_BATCH})`)
        return
      }
      const session = anyCtx.sessions?.get(sessionId)
      const cwd = session?.header?.cwd
      if (typeof cwd !== 'string' || cwd.length === 0) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('session cwd unavailable')
        return
      }
      const dir = resolve(cwd, '.dsh', 'references')
      await mkdir(dir, { recursive: true })
      const saved: { path: string; name: string; bytes: number }[] = []
      for (const entry of files) {
        const name = typeof entry?.name === 'string' ? entry.name : ''
        const data = typeof entry?.data === 'string' ? entry.data : ''
        if (name === '' || data === '') {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('each file needs name and base64 data')
          return
        }
        const bytes = Buffer.from(data, 'base64')
        if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
          res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
          res.end(`file "${name}" too large or empty (max ${MAX_UPLOAD_BYTES} bytes)`)
          return
        }
        try {
          const target = await writeDeduped(dir, name, bytes)
          const leaf = basename(target)
          saved.push({ path: `.dsh/references/${leaf}`, name: leaf, bytes: bytes.length })
        } catch (error) {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          res.end(`failed to write "${name}": ${String(error)}`)
          return
        }
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ files: saved }))
    },
  }), '@dsh-external/dsh-file-upload: batch upload api')
}
