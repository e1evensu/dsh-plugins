/**
 * @dsh-external/dsh-file-upload — client half.
 *
 * Composer dock: a multi-file upload button plus document-level capture-phase
 * listeners that reroute non-image file drops (and pastes) into the reference
 * upload pipeline. Image-only drops and pastes pass through untouched, so the
 * native attachment rail keeps handling images exactly as before.
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'

type ClientContext = {
  slots: SlotsService
}

export const inject = ['slots']

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const UPLOAD_API = '/@dsh-external/dsh-file-upload/api/upload'
const COUNT_API = '/@dsh-external/dsh-plugin-leaderboard/api/count'
const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('read failed'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function UploadDock(props: any): any {
  const { inputActions, session, input } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'error' | 'done'; text: string } | null>(null)
  // The owner `input` prop is a live InputState snapshot, but closures capture
  // it at render time; a ref keeps the upload handler reading the LATEST draft.
  const draftRef = useRef<{ draft?: string }>(input)
  draftRef.current = input
  const sessionId = session?.sessionId as string | undefined

  /** Report usage to the leaderboard plugin; best-effort, never blocks uploads. */
  const reportUsage = useCallback((count: number): void => {
    fetch(COUNT_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plugin: '@dsh-external/dsh-file-upload', tool: 'upload', n: count }),
    }).catch(() => { /* leaderboard unavailable — usage tracking is best-effort */ })
  }, [])

  const handleFiles = useCallback(async (files: readonly File[] | FileList | null): Promise<void> => {
    const list = files === null || files === undefined ? [] : Array.from(files)
    if (list.length === 0) return
    const tooBig = list.find(file => file.size > MAX_UPLOAD_BYTES)
    if (tooBig !== undefined) {
      setNotice({ kind: 'error', text: `文件太大（>${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）：${tooBig.name}` })
      return
    }
    if (sessionId === undefined) {
      setNotice({ kind: 'error', text: '当前会话不可用，无法上传文件' })
      return
    }
    setUploading(true)
    setNotice(null)
    try {
      const payload = []
      for (const file of list) {
        payload.push({ name: file.name, data: await fileToBase64(file) })
      }
      const response = await fetch(UPLOAD_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, files: payload }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `HTTP ${response.status}`)
      }
      const result = await response.json() as { files?: { path: string; name: string }[] }
      const saved = result?.files ?? []
      if (saved.length === 0) throw new Error('upload response missing files')
      const snippet = saved.map(file => `\n\n[参考文件：${file.name}](<${file.path}>)`).join('')
      inputActions.setDraft((draftRef.current?.draft ?? '') + snippet)
      reportUsage(saved.length)
      setNotice({ kind: 'done', text: `已上传 ${saved.length} 个文件到 .dsh/references/` })
    } catch (cause) {
      setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : '上传失败' })
    } finally {
      setUploading(false)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }, [inputActions, sessionId, reportUsage])

  // Capture-phase interception: runs before the composer's own document-level
  // bubble handlers, so a non-image drop never reaches the image-only rail
  // (which would reject it with an error toast). Image-only drops do nothing
  // here and keep the native attachment behavior.
  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean =>
      event.dataTransfer?.types.includes('Files') ?? false

    const isReferenceDrop = (event: DragEvent): boolean => {
      const items = event.dataTransfer?.items
      if (items === undefined || items.length === 0) return true
      let sawFile = false
      for (const item of Array.from(items)) {
        if (item.kind !== 'file') continue
        sawFile = true
        if (!IMAGE_TYPES.includes(item.type)) return true
      }
      return !sawFile
    }

    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event) || !isReferenceDrop(event)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event) || event.dataTransfer === null || !isReferenceDrop(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event) || !isReferenceDrop(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void handleFiles(event.dataTransfer?.files ?? null)
    }
    const onPaste = (event: ClipboardEvent): void => {
      const files = event.clipboardData?.files
      if (files === undefined || files.length === 0) return
      const list = Array.from(files)
      if (list.every(file => IMAGE_TYPES.includes(file.type))) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void handleFiles(list)
    }
    const options: AddEventListenerOptions = { capture: true }
    document.addEventListener('dragenter', onDragEnter, options)
    document.addEventListener('dragover', onDragOver, options)
    document.addEventListener('drop', onDrop, options)
    document.addEventListener('paste', onPaste, options)
    return () => {
      document.removeEventListener('dragenter', onDragEnter, options)
      document.removeEventListener('dragover', onDragOver, options)
      document.removeEventListener('drop', onDrop, options)
      document.removeEventListener('paste', onPaste, options)
    }
  }, [handleFiles])

  const noticeStyle = notice?.kind === 'error'
    ? { color: '#d33', fontSize: 12, marginLeft: 4 }
    : { color: '#2a2', fontSize: 12, marginLeft: 4 }

  return createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 2 } },
    createElement('button', {
      type: 'button',
      title: '上传任意文件到当前工作区（支持多选；也可直接拖拽非图片文件到页面任意位置）',
      disabled: uploading,
      onClick: () => inputRef.current?.click(),
      style: {
        border: 'none',
        background: 'transparent',
        cursor: uploading ? 'not-allowed' : 'pointer',
        fontSize: 16,
        lineHeight: 1,
        padding: '4px 6px',
        opacity: uploading ? 0.4 : 0.85,
      },
    }, uploading ? '⏳' : '📎'),
    createElement('input', {
      ref: inputRef,
      type: 'file',
      multiple: true,
      style: { display: 'none' },
      onChange: (event: { target: { files: FileList | null } }) => { void handleFiles(event.target.files) },
    }),
    notice === null ? null : createElement('span', { style: noticeStyle }, notice.text),
  )
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: '@dsh-external/dsh-file-upload',
      order: 7,
    }, UploadDock),
  ), '@dsh-external/dsh-file-upload: upload dock')
}
