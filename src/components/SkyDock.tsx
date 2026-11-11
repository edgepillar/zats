import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import { useSky } from '../scene/sky'
import type { TimeOfDay, Weather } from '../scene/scene'
import { Scene } from './Scene'

/** 9 × 9 pixel icons, drawn as squares in the text colour. */
const ICONS: Record<TimeOfDay | Weather | 'look', string[]> = {
  morning: ['.........', '....#....', '.#.....#.', '...###...', '..#####..', '.#######.', '#########', '.........', '.#.#.#.#.'],
  day: ['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....'],
  evening: ['.........', '.........', '.#.....#.', '...###...', '..#####..', '#########', '.........', '..#.#.#..', '.........'],
  night: ['..####...', '.###.....', '###......', '###......', '###...#..', '###......', '###......', '.###.....', '..####...'],
  clear: ['....#....', '....#....', '...###...', '.#######.', '...###...', '....#....', '....#....', '.........', '.........'],
  cloudy: ['.........', '...###...', '..#####..', '.########', '#########', '#########', '.#######.', '.........', '.........'],
  rain: ['...###...', '..#####..', '.#######.', '#########', '.#######.', '.........', '.#..#..#.', '#..#..#..', '.........'],
  look: ['###...###', '#.......#', '#.......#', '.........', '.........', '.........', '#.......#', '#.......#', '###...###'],
}

export function PixelIcon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="pixel-icon" viewBox="0 0 9 9" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {ICONS[name].flatMap((row, y) =>
        [...row].map((c, x) => (c === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)),
      )}
    </svg>
  )
}

/**
 * The world behind the site and its controls: a small glass dock at the bottom with the sky
 * panel (time of day, weather) and "look around", which fades the page away to show the scene.
 */
export function SkyWorld() {
  const { t } = useI18n()
  const { sky, stepTime, stepWeather, setFollowClock, setDrift } = useSky()
  const [open, setOpen] = useState(false)
  const [looking, setLooking] = useState(false)
  const panelId = useId()

  useEffect(() => {
    document.documentElement.classList.toggle('scene-only', looking)
    if (!looking) return
    const back = (e: KeyboardEvent) => e.key === 'Escape' && setLooking(false)
    window.addEventListener('keydown', back)
    return () => window.removeEventListener('keydown', back)
  }, [looking])

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <>
      <Scene time={sky.time} weather={sky.weather} />
      <div className="sky">
        {open && (
          <div className="sky-panel" id={panelId} role="dialog" aria-label={t('sky.title')}>
            <div className="sky-panel-head">
              <p className="sky-panel-title">{t('sky.title')}</p>
              <button type="button" className="sky-x" aria-label={t('sky.close')} onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="sky-cols">
              <SkyColumn
                label={t('sky.time')}
                icon={sky.time}
                value={t(`sky.${sky.time}`)}
                onStep={stepTime}
                toggle={{ label: t('sky.follow'), on: sky.followClock, set: setFollowClock }}
              />
              <SkyColumn
                label={t('sky.weather')}
                icon={sky.weather}
                value={t(`sky.${sky.weather}`)}
                onStep={stepWeather}
                toggle={{ label: t('sky.drift'), on: sky.drift, set: setDrift }}
              />
            </div>
            <p className="sky-note">{t('sky.note')}</p>
          </div>
        )}
        <div className="sky-dock" role="toolbar" aria-label={t('sky.title')}>
          <button
            type="button"
            className="sky-btn"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={t('sky.open')}
            title={t('sky.open')}
            onClick={() => setOpen((o) => !o)}
          >
            <PixelIcon name={sky.time} />
          </button>
          <button
            type="button"
            className="sky-btn"
            aria-pressed={looking}
            aria-label={looking ? t('sky.back') : t('sky.look')}
            title={looking ? t('sky.back') : t('sky.look')}
            onClick={() => {
              setLooking((l) => !l)
              setOpen(false)
            }}
          >
            <PixelIcon name="look" />
          </button>
        </div>
      </div>
    </>
  )
}

function SkyColumn({
  label,
  icon,
  value,
  onStep,
  toggle,
}: {
  label: string
  icon: keyof typeof ICONS
  value: string
  onStep: (by: number) => void
  toggle: { label: string; on: boolean; set: (on: boolean) => void }
}) {
  const { t } = useI18n()
  return (
    <div className="sky-col">
      <p className="sky-label">{label}</p>
      <div className="sky-orb">
        <PixelIcon name={icon} size={36} />
      </div>
      <div className="sky-pick">
        <button type="button" aria-label={`${label}: ${t('sky.prev')}`} onClick={() => onStep(-1)}>
          ‹
        </button>
        <span aria-live="polite">{value}</span>
        <button type="button" aria-label={`${label}: ${t('sky.next')}`} onClick={() => onStep(1)}>
          ›
        </button>
      </div>
      <label className="sky-toggle">
        <span>{toggle.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={toggle.on}
          aria-label={toggle.label}
          className="switch"
          onClick={() => toggle.set(!toggle.on)}
        >
          <span />
        </button>
      </label>
    </div>
  )
}
