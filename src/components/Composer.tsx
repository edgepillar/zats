import { useRef, type ReactNode } from 'react'
import { PhotoIcon } from './Icons'

/** Bottom bar, where a chat app's text box would be. Holds the file picker. */
export function Composer({
  label,
  icon,
  multiple = false,
  onFiles,
  children,
  testId,
}: {
  label: string
  icon: ReactNode
  multiple?: boolean
  onFiles: (files: File[]) => void
  children?: ReactNode
  testId?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="composer">
      <div className="composer-inner">
        <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
          <span className="btn-icon" aria-hidden="true">
            {icon}
          </span>
          {label}
        </button>
        {children}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple={multiple}
          hidden
          data-testid={testId}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = '' // allow choosing the same file again
            if (files.length) onFiles(files)
          }}
        />
      </div>
    </div>
  )
}

export function DropOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-box">
        <PhotoIcon size={40} className="drop-overlay-icon" />
        {label}
      </div>
    </div>
  )
}
