/** Kakaonut's mark: a brown K on yellow, set in Bricolage Grotesque. */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`logo-mark ${className}`} style={{ ['--logo-size' as string]: `${size}px` }} aria-hidden="true">
      K
    </span>
  )
}
