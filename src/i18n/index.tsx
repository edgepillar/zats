import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Key } from './en'
import { detectLang, formatBytes, formatNumber, translate, type Lang, type Vars } from './translate'
import { loadJson, saveJson } from '../storage'

export type { Lang, Key }
export { satsUnit } from './translate'

const STORAGE_KEY = 'kakaonut.lang'

interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: Key, vars?: Vars) => string
  num: (n: number) => string
  bytes: (n: number) => string
}

const I18nContext = createContext<I18n | null>(null)

function initialLang(): Lang {
  const saved = loadJson<string | null>(STORAGE_KEY, null)
  if (saved === 'en' || saved === 'ko') return saved
  return detectLang(typeof navigator === 'undefined' ? undefined : navigator.language)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    saveJson(STORAGE_KEY, next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'meta.title')
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate(lang, 'meta.description'))
  }, [lang])

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      num: (n) => formatNumber(lang, n),
      bytes: (n) => formatBytes(lang, n),
    }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
