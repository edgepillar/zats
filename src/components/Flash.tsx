import type { ReactNode } from 'react'

/**
 * A button label that swaps for a moment ("Copy" → "Copied!"). The new label eases in so the tap
 * reads as heard; going back is instant.
 */
export function FlashLabel({ flash, children }: { flash: string | null; children: ReactNode }) {
  if (flash === null) return <>{children}</>
  return (
    <span key={flash} className="flash-in">
      {flash}
    </span>
  )
}
