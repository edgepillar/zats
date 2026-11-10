import { Fragment, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n, type Key } from '../i18n'
import { Character } from '../components/Buddies'
import { LogoMark } from '../components/Logo'
import { PixelExplainer } from '../components/PixelExplainer'

/** How it works: a simple explanation first, an advanced one a tab away. */

type Tab = 'simple' | 'advanced'
const TABS: Tab[] = ['simple', 'advanced']
const REPO = 'https://github.com/swedishfrenchpress/kakaonut'

export function HowScreen() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('simple')
  const buttons = useRef<Record<Tab, HTMLButtonElement | null>>({ simple: null, advanced: null })

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next: Tab = e.key === 'Home' ? 'simple' : e.key === 'End' ? 'advanced' : tab === 'simple' ? 'advanced' : 'simple'
    setTab(next)
    buttons.current[next]?.focus()
  }

  return (
    <section className="how" aria-labelledby="how-title">
      <div className="how-head">
        <h1 id="how-title">{t('how.title')}</h1>
        <p>
          {/* Each comma-separated phrase stays whole, so the line breaks at a comma */}
          {t('how.sub')
            .split(/(?<=,) /)
            .map((phrase, i) => (
              <Fragment key={i}>
                {i > 0 && ' '}
                <span className="phrase">{phrase}</span>
              </Fragment>
            ))}
        </p>
        <div className="seg how-tabs" role="tablist" aria-label={t('how.tabs')}>
          {TABS.map((k) => (
            <button
              key={k}
              ref={(el) => {
                buttons.current[k] = el
              }}
              type="button"
              role="tab"
              id={`how-tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`how-panel-${k}`}
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              onKeyDown={onKey}
            >
              {t(`how.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="how-panel" role="tabpanel" id={`how-panel-${tab}`} aria-labelledby={`how-tab-${tab}`}>
        {tab === 'simple' ? <Simple /> : <Advanced />}
      </div>
    </section>
  )
}

const STEPS = [
  { art: 'photo', key: 's1' },
  { art: 'bolt', key: 's2' },
  { art: 'coin', key: 's3' },
  { art: 'k', key: 's4' },
] as const

function Simple() {
  const { t } = useI18n()
  return (
    <>
      <ol className="how-steps">
        {STEPS.map(({ art, key }) => (
          <li key={key} className="how-step">
            <span className="how-art">{art === 'k' ? <LogoMark size={48} /> : <Character kind={art} size={56} />}</span>
            <div>
              <h2>{t(`how.${key}.title` as Key)}</h2>
              <p>{t(`how.${key}.body` as Key)}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="how-visual">
        <h2>{t('px.title')}</h2>
        <PixelExplainer />
      </section>
      <div className="how-good">
        <h2>{t('how.good.title')}</h2>
        <ul>
          <li>{t('how.good.original')}</li>
          <li>{t('how.good.cash')}</li>
          <li>{t('how.good.back')}</li>
        </ul>
      </div>
    </>
  )
}

const SECTIONS = ['ecash', 'pixels', 'read', 'kakao', 'claim', 'privacy'] as const

function Advanced() {
  const { t } = useI18n()
  return (
    <>
      {SECTIONS.map((s) => (
        <section key={s} className="how-sec">
          <h2>{t(`how.a.${s}.title` as Key)}</h2>
          <p>{t(`how.a.${s}.body` as Key)}</p>
          {s === 'pixels' && (
            <>
              <PixelExplainer />
              <Frame />
            </>
          )}
        </section>
      ))}
      <a className="how-source" href={REPO} target="_blank" rel="noopener noreferrer">
        {t('how.a.source')}
      </a>
    </>
  )
}

const FRAME = [
  { code: 'SATS', label: 'how.a.frame.magic', grow: 4 },
  { code: '01', label: 'how.a.frame.version', grow: 2 },
  { code: 'u32', label: 'how.a.frame.length', grow: 3 },
  { code: 'cashuB…', label: 'how.a.frame.token', grow: 7, token: true },
  { code: 'CRC-32', label: 'how.a.frame.crc', grow: 4 },
] as const

/** The hidden-data frame, drawn as a row of byte fields. */
function Frame() {
  const { t } = useI18n()
  return (
    <figure className="frame">
      <div className="frame-row">
        {FRAME.map((f) => (
          <div key={f.code} className={`frame-cell${'token' in f ? ' frame-cell--token' : ''}`} style={{ flexGrow: f.grow }}>
            <code>{f.code}</code>
            <span>{t(f.label)}</span>
          </div>
        ))}
      </div>
      <figcaption>{t('how.a.frame.caption')}</figcaption>
    </figure>
  )
}
