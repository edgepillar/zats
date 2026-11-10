import { useEffect, useState } from 'react'
import { LogoMark } from './components/Logo'
import { Hero } from './components/Hero'
import { Footer } from './components/Footer'
import { ActionSection } from './components/ActionSection'
import { useI18n } from './i18n'
import { TestScreen } from './screens/TestScreen'
import { OpenScreen } from './screens/OpenScreen'
import { HowScreen } from './screens/HowScreen'
import { goToMode, modeFromHash, scrollToActions, type Mode } from './nav'

/** #open (the chat-style reader) and #test are kept for the KakaoTalk test; nothing links to them. */
type Page = 'make' | 'open' | 'test' | 'how'

function pageFromHash(): Page {
  if (location.hash === '#open') return 'open'
  if (location.hash === '#test') return 'test'
  if (location.hash === '#how') return 'how'
  return 'make' // '', '#hide', '#redeem', '#make'
}

export function App() {
  const { t, lang, setLang } = useI18n()
  const [page, setPage] = useState<Page>(pageFromHash)
  const [mode, setMode] = useState<Mode>(() => modeFromHash(location.hash) ?? 'hide')
  // Bumped whenever the action card should scroll into view (after it has rendered).
  const [scrollAsk, setScrollAsk] = useState(() => (modeFromHash(location.hash) ? 1 : 0))

  useEffect(() => {
    const onHash = () => {
      const next = pageFromHash()
      const nextMode = modeFromHash(location.hash)
      if (nextMode) {
        setMode(nextMode)
        setScrollAsk((n) => n + 1)
      }
      setPage((prev) => {
        if (!nextMode && prev !== next) window.scrollTo({ top: 0 })
        return next
      })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (scrollAsk > 0) requestAnimationFrame(() => scrollToActions(scrollAsk > 1))
  }, [scrollAsk])

  const other = lang === 'en' ? 'ko' : 'en'

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <a className="brand" href="#" aria-label={t('app.name')}>
            <LogoMark size={36} />
            <span className="brand-name">{lang === 'ko' ? '카카오넛' : 'Kakaonut'}</span>
          </a>
          <nav className="modes" aria-label={t('nav.label')}>
            {(['hide', 'redeem'] as const).map((m) => (
              <a
                key={m}
                href={`#${m}`}
                aria-current={page === 'make' && mode === m ? 'page' : undefined}
                onClick={(e) => goToMode(m, e)}
              >
                {t(`nav.${m}`)}
              </a>
            ))}
          </nav>
          <button type="button" className="lang-btn" lang={other} onClick={() => setLang(other)}>
            {other === 'en' ? 'EN' : '한국어'}
          </button>
        </div>
      </header>

      {/* Pages stay mounted so an invoice or finished photos survive switching pages. */}
      <main className="page page--make" hidden={page !== 'make'}>
        <Hero />
        <ActionSection mode={mode} active={page === 'make'} />
      </main>
      <main className="page page--chat" hidden={page !== 'open'}>
        <OpenScreen active={page === 'open'} />
      </main>
      <main className="page page--chat" hidden={page !== 'test'}>
        <TestScreen active={page === 'test'} />
      </main>
      <main className="page page--how" hidden={page !== 'how'}>
        <HowScreen />
      </main>

      <Footer />
    </div>
  )
}
