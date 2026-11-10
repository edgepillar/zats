import { useId } from 'react'
import { useI18n } from '../i18n'
import { LogoMark } from './Logo'

/** Footer: event info left, quiet links right, arched wordmark with the K peeking up. */
export function Footer() {
  const { t, lang } = useI18n()
  const arcId = `foot-arc-${useId().replace(/:/g, '')}`
  return (
    <footer className="foot">
      <p className="foot-col">
        {t('footer.event')}
        <br />
        {t('footer.dates')}
        <span className="foot-accent">{t('footer.edition')}</span>
      </p>

      <a className="foot-logo" href="#" aria-label={t('app.name')}>
        <svg className="foot-arc" viewBox="0 0 420 130" aria-hidden="true">
          <path id={arcId} d="M 20 122 Q 210 -6 400 122" fill="none" />
          <text fontSize={lang === 'ko' ? 76 : 70} textAnchor="middle">
            <textPath href={`#${arcId}`} startOffset="50%">
              {lang === 'ko' ? '카카오넛' : 'KAKAONUT'}
            </textPath>
          </text>
        </svg>
        <LogoMark size={168} className="foot-mark" />
      </a>

      <p className="foot-col foot-col--right">
        <a href="#redeem">{t('footer.redeem')}</a>
        <a href="#how">{t('footer.how')}</a>
        <a className="foot-accent" href="https://cashu.space" target="_blank" rel="noopener noreferrer">
          {t('footer.credit')}
        </a>
        <a className="foot-by" href="https://x.com/eriklocalhost" target="_blank" rel="noopener noreferrer">
          {t('footer.by')}
        </a>
      </p>
    </footer>
  )
}
