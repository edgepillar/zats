import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { prefersReducedMotion } from '../hooks'
import { formatFiat, peekBtcPrice } from '../price'
import { HeroPhoto, HeroPixels, preloadHeroPhoto } from './HeroPhoto'
import { Character } from './Buddies'
import { goToMode } from '../nav'

/**
 * Hero: a KakaoTalk-style chat on a phone. A photo is sent, light passes over it like a banknote
 * held up to a window, its pixels show for a moment, and a footer opens with the bitcoin inside.
 * Plays as a loop of timed steps; with reduced motion it shows the last frame only.
 */

const AMOUNT = 20000

// Step → when it starts (ms from the start of the loop).
const TIMELINE = [
  0, //    0: empty chat (date chip)
  500, //  1: friend's message
  1500, // 2: my text
  2300, // 3: my photo, sending
  3000, // 4: photo sent
  3500, // 5: light passes over the photo
  5400, // 6: read; the footer opens with the amount
  6900, // 7: friend replies
]
const LOOP_MS = 10_200
const LAST = TIMELINE.length - 1
const FADE_MS = 300 // the room fading out before it starts again
const DWELL_MS = 2500 // a whole conversation that is already showing stays readable this long
const SLIDE = { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }

export function Hero() {
  const { t, num, lang } = useI18n()
  const [reduced] = useState(prefersReducedMotion)
  const [step, setStep] = useState(() => (reduced ? LAST : 0))
  const [cycle, setCycle] = useState(0)
  const [fading, setFading] = useState(false)
  // Null until the first look; then whether the phone is on screen enough to play.
  const [playing, setPlaying] = useState<boolean | null>(null)
  const phone = useRef<HTMLDivElement>(null)
  const photo = useRef<HTMLImageElement>(null)
  const feed = useRef<HTMLDivElement>(null)
  const feedHeight = useRef(0)
  const shown = useRef(step)

  useEffect(preloadHeroPhoto, [])
  useEffect(() => {
    shown.current = step
  })

  // Play once nearly half the phone shows. Stop only when it has left the screen entirely, so a
  // chat someone can still see never empties; a phone that only peeks in rests on the whole chat.
  useEffect(() => {
    if (reduced) return
    const el = phone.current
    if (!el || typeof IntersectionObserver === 'undefined') return setPlaying(true)
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.45) setPlaying(true)
        else if (!e.isIntersecting) setPlaying(false)
        else setPlaying((p) => p ?? false)
      },
      { threshold: [0, 0.45] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  // Not playing: the finished conversation, standing still.
  useEffect(() => {
    if (playing !== false) return
    setFading(false)
    setStep(LAST)
  }, [playing])

  useEffect(() => {
    if (!playing) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    // Fade out what's showing, then start from the top in a fresh room.
    const restart = (after: number) => {
      at(after, () => setFading(true))
      at(after + FADE_MS, () => {
        setFading(false)
        setStep(0)
        setCycle((c) => c + 1)
      })
    }
    if (shown.current !== 0) {
      restart(DWELL_MS)
    } else {
      TIMELINE.forEach((ms, i) => at(ms, () => setStep(i)))
      restart(LOOP_MS)
    }
    return () => timers.forEach(clearTimeout)
  }, [playing, cycle])

  // A new message pushes the ones above it up: slide them instead of letting them jump.
  useLayoutEffect(() => {
    const el = feed.current
    if (!el) return
    const h = el.offsetHeight
    const grew = h - feedHeight.current
    feedHeight.current = h
    if (!playing || reduced || grew <= 0) return
    el.animate([{ transform: `translateY(${grew}px)` }, { transform: 'none' }], SLIDE)
  }, [step, cycle, playing, reduced])

  const now = new Date()
  const time = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(now)
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(now)
  const read = step >= 6
  // Dollars or won only if this visit already fetched the price: the hero never fetches it.
  const price = peekBtcPrice()
  const fiat = price && formatFiat(AMOUNT, price, lang)

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title" className="hero-title">
          {t('hero.title')}
        </h1>
        <p className="hero-sub">{t('hero.sub')}</p>
        <div className="hero-ctas">
          <a className="btn btn--primary btn--lg" href="#hide" onClick={(e) => goToMode('hide', e)}>
            {t('hero.hide')}
          </a>
          <a className="btn btn--ink btn--lg" href="#redeem" onClick={(e) => goToMode('redeem', e)}>
            {t('hero.redeem')}
          </a>
        </div>
      </div>

      <div className="hero-stage">
        <div className="phone" ref={phone} role="img" aria-label={t('chat.label', { amount: num(AMOUNT) })}>
          <div className="phone-screen" aria-hidden="true">
            <div className="kt-status">
              <span className="kt-time">9:41</span>
              <span className="kt-island" />
              <span className="kt-status-icons">
                <SignalIcon />
                <WifiIcon />
                <BatteryIcon />
              </span>
            </div>
            <div className="kt-head">
              <BackIcon />
              <span className="kt-title">{t('chat.friend')}</span>
              <span className="kt-head-icons">
                <SearchIcon />
                <MenuIcon />
              </span>
            </div>

            <div className={`kt-room${fading ? ' is-fading' : ''}`} key={cycle}>
              <div className="kt-date">{date}</div>
              <div className="kt-feed" ref={feed}>
                {step >= 1 && (
                  <div className="kt-row kt-row--them">
                    <span className="kt-avatar">
                      <Character kind="coin" size={30} />
                    </span>
                    <div className="kt-col">
                      <span className="kt-name">{t('chat.friend')}</span>
                      <div className="kt-line">
                        <span className="kt-bubble kt-bubble--them">{t('chat.m1')}</span>
                        <span className="kt-meta">{time}</span>
                      </div>
                    </div>
                  </div>
                )}

                {step >= 2 && (
                  <div className="kt-row kt-row--me">
                    <div className="kt-line">
                      <span className="kt-meta">
                        {!read && <b className="kt-unread">1</b>}
                        {time}
                      </span>
                      <span className="kt-bubble kt-bubble--me">{t('chat.m2')}</span>
                    </div>
                  </div>
                )}

                {step >= 3 && (
                  <div className="kt-row kt-row--me">
                    <div className="kt-line">
                      <span className="kt-meta">
                        {!read && step >= 4 && <b className="kt-unread">1</b>}
                        {step >= 4 && time}
                      </span>
                      <div
                        className={[
                          'kt-photo',
                          step === 3 && 'is-sending',
                          step === 5 && 'is-lit',
                          step >= 6 && 'is-open',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="kt-photo-clip">
                          <HeroPhoto ref={photo} />
                          <div className="kt-light">
                            <HeroPixels source={photo} />
                          </div>
                          {(step === 3 || step === 4) && (
                            <div className={`kt-sending${step === 4 ? ' is-done' : ''}`} />
                          )}
                        </div>
                        <div className="kt-photo-foot">
                          <span className="kt-foot-label">{t('chat.inside')}</span>
                          <b className="kt-foot-main">{fiat || `${num(AMOUNT)} sats`}</b>
                          {fiat && <span className="kt-foot-sub">{num(AMOUNT)} sats</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {step >= LAST && (
                  <div className="kt-row kt-row--them">
                    <span className="kt-avatar">
                      <Character kind="coin" size={30} />
                    </span>
                    <div className="kt-col">
                      <span className="kt-name">{t('chat.friend')}</span>
                      <div className="kt-line">
                        <span className="kt-bubble kt-bubble--them">{t('chat.m3')}</span>
                        <span className="kt-meta">{time}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="kt-input">
              <span className="kt-plus">+</span>
              <span className="kt-field" />
              <span className="kt-send">{t('chat.send')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* The phone's status bar, drawn at iPhone proportions: four signal bars, a Wi-Fi fan, a battery. */
function SignalIcon() {
  return (
    <svg viewBox="0 0 17 11" width="15" height="10" fill="currentColor">
      <rect x="0" y="7" width="3" height="4" rx="1" />
      <rect x="4.6" y="5" width="3" height="6" rx="1" />
      <rect x="9.2" y="2.6" width="3" height="8.4" rx="1" />
      <rect x="13.8" y="0" width="3" height="11" rx="1" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 12" width="14" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1.64 4.64 A9 9 0 0 1 14.36 4.64" />
      <path d="M4.46 7.46 A5 5 0 0 1 11.54 7.46" />
      <circle cx="8" cy="10.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 27 12" width="23" height="10.5">
      <rect x="0.5" y="0.5" width="23" height="11" rx="3.2" fill="none" stroke="currentColor" strokeOpacity="0.4" />
      <rect x="2" y="2" width="20" height="8" rx="1.8" fill="currentColor" />
      <path d="M25 4.2v3.6a2 2 0 0 0 0-3.6z" fill="currentColor" fillOpacity="0.45" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg className="kt-back" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 L21 21" strokeLinecap="round" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 6 H20 M4 12 H20 M4 18 H20" />
    </svg>
  )
}
