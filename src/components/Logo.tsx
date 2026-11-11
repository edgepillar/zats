/** A 7 × 7 pixel "Z": the zats mark, drawn as squares to sit with the pixel-art world. */
const Z = ['1111111', '0000011', '0000110', '0001100', '0011000', '0110000', '1111111']

export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`logo-mark ${className}`} style={{ ['--logo-size' as string]: `${size}px` }} aria-hidden="true">
      <svg viewBox="-2 -2 11 11" width="100%" height="100%" shapeRendering="crispEdges">
        {Z.flatMap((row, y) =>
          [...row].map((c, x) => (c === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)),
        )}
      </svg>
    </span>
  )
}
