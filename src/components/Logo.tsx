/** Zats' mark: a brown Z on yellow, set in Bricolage Grotesque (kept from Kakaonut's K). */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`logo-mark ${className}`} style={{ ['--logo-size' as string]: `${size}px` }} aria-hidden="true">
      Z
    </span>
  )
}
