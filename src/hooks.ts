import { useEffect, useRef, useState } from 'react'
import { imageFilesFrom } from './actions'

/** Calls `onFiles` when images are pasted anywhere on the page (not into a text field). */
export function usePasteImages(onFiles: (files: File[]) => void, enabled = true) {
  const handler = useRef(onFiles)
  handler.current = onFiles
  useEffect(() => {
    if (!enabled) return
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFilesFrom(e.clipboardData)
      if (!files.length) return // plain text paste: leave it alone
      e.preventDefault()
      handler.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enabled])
}

/** Accepts files dropped anywhere on the window. Returns whether a drag is over the window. */
export function useDropImages(onFiles: (files: File[]) => void, enabled = true): boolean {
  const handler = useRef(onFiles)
  handler.current = onFiles
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = imageFilesFrom(e.dataTransfer)
      if (files.length) handler.current(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      setDragging(false)
    }
  }, [enabled])
  return dragging
}

/** Temporary label swap for buttons, e.g. "Copy" → "Copied!". */
export function useFlash(ms = 1600): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return [
    msg,
    (next: string) => {
      setMsg(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMsg(null), ms)
    },
  ]
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Smooth scrolling, unless the person asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
