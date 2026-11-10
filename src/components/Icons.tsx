/** One small icon set: 24px grid, 1.75 stroke, round caps. Decorative unless labelled by the parent. */

type P = { size?: number; className?: string }

function Svg({ size = 20, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const PhotoIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 16.5 15.5 11.8a1.2 1.2 0 0 0-1.7 0L6 19.4" />
  </Svg>
)

export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M5 19.5h14" />
  </Svg>
)

export const ShareIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 14.5V3.5" />
    <path d="m8 7.5 4-4 4 4" />
    <path d="M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5" />
  </Svg>
)

export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </Svg>
)

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    {/* pathLength lets CSS draw the tick from 0 to 1 */}
    <path d="m5 12.5 4.5 4.5L19 7.5" pathLength={1} />
  </Svg>
)

export const BoltIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13.2 3.5 5.5 13.4h6l-1 7.1 7.7-9.9h-6z" />
  </Svg>
)

export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7" />
    <path d="m6.5 7 .8 11.3c.07.96.87 1.7 1.83 1.7h5.74c.96 0 1.76-.74 1.83-1.7L17.5 7" />
    <path d="M10 11v5.5M14 11v5.5" />
  </Svg>
)

export const ChevronIcon = (p: P) => (
  <Svg {...p}>
    <path d="m8 10 4 4 4-4" />
  </Svg>
)
