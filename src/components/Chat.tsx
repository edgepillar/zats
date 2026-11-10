import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoMark } from './Logo'
import { useI18n } from '../i18n'
import { prefersReducedMotion } from '../hooks'

export function Thread({ children }: { children: ReactNode }) {
  return <div className="thread">{children}</div>
}

/** Centered system line, like a date separator in a chat. */
export function SysChip({ children, tone }: { children: ReactNode; tone?: 'test' }) {
  return (
    <div className="sys-row">
      <span className={`sys-chip${tone ? ` sys-chip--${tone}` : ''}`}>{children}</span>
    </div>
  )
}

export function Typing() {
  const { t } = useI18n()
  return (
    <span className="typing" role="status" aria-label={t('bot.typing')}>
      <i />
      <i />
      <i />
    </span>
  )
}

interface BotProps {
  children: ReactNode
  /** Show the avatar and name (first message of a group). */
  head?: boolean
  /** ms before the typing dots start, and how long they show. Skipped with reduced motion. */
  delay?: number
  typing?: number
  /** Keep showing the typing dots (e.g. while work is running). */
  busy?: boolean
  card?: boolean
  /** No bubble around the content: it's its own bubble (the money card). */
  bare?: boolean
  scrollIntoView?: boolean
  className?: string
}

/** A message from Kakaonut: avatar on the left, white bubble, typing dots before it appears. */
export function Bot({
  children,
  head = false,
  delay = 0,
  typing = 450,
  busy = false,
  card = false,
  bare = false,
  scrollIntoView = false,
  className = '',
}: BotProps) {
  const [stage, setStage] = useState<'wait' | 'typing' | 'shown'>(() =>
    prefersReducedMotion() || (delay === 0 && typing === 0) ? 'shown' : delay > 0 ? 'wait' : 'typing',
  )
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    if (stage === 'shown') return
    const a = setTimeout(() => setStage('typing'), delay)
    const b = setTimeout(() => setStage('shown'), delay + typing)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
    // Runs once per message; later re-renders (e.g. language switch) must not replay it.
  }, [])

  const visible = stage === 'shown' && !busy
  useEffect(() => {
    if (visible && scrollIntoView) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
  }, [visible, scrollIntoView])

  if (stage === 'wait') return null
  return (
    <div className={`msg msg--bot${head ? ' msg--head' : ''}`} ref={ref}>
      <div className="avatar" aria-hidden="true">
        {head && <LogoMark size={40} />}
      </div>
      <div className="msg-body">
        {head && <div className="msg-name">{t('app.name')}</div>}
        {visible ? (
          <div className={`bubble bubble--bot${card ? ' bubble--card' : ''}${bare ? ' bubble--bare' : ''} ${className}`}>{children}</div>
        ) : (
          <div className="bubble bubble--bot bubble--typing">
            <Typing />
          </div>
        )}
      </div>
    </div>
  )
}

/** The user's side of the conversation: right-aligned yellow bubble. */
export function Me({ children, media = false }: { children: ReactNode; media?: boolean }) {
  return (
    <div className="msg msg--me">
      <div className={`bubble bubble--me${media ? ' bubble--media' : ''}`}>{children}</div>
    </div>
  )
}
