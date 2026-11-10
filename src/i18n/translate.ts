import { en, type Dict, type Key } from './en'

/** English only for now; a new language is a dictionary here plus an entry in LANGS. */
export type Lang = 'en'
export type Vars = Record<string, string | number>

export const dictionaries: Record<Lang, Dict> = { en }
export const LANGS: Lang[] = ['en']

// A trailing emoji should never wrap onto a line of its own.
const TRAILING_EMOJI = / ((?:\p{Extended_Pictographic}\uFE0F?)+)$/u

// One zat, not "1 zats" (and "1 zat is", not "1 zat are"). Not preceded by a digit, so 21 and 1,001 stay.
const ONE_ZATS = /(?<![\d.,])1 zats\b/g
const ONE_ZAT_ARE = /(?<![\d.,])1 zat are\b/g

/** "zat" for exactly one, "zats" otherwise. 1 ZNN = 100,000,000 zats. */
export function zatsUnit(n: number): string {
  return n === 1 ? 'zat' : 'zats'
}

/** Fills named placeholders like {amount}. Unknown placeholders are left as they are. */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const template = (dictionaries[lang][key] || en[key]).replace(TRAILING_EMOJI, '\u00A0$1')
  if (!vars) return template
  return template
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
    .replace(ONE_ZATS, '1 zat')
    .replace(ONE_ZAT_ARE, '1 zat is')
}

export function detectLang(_navigatorLanguage: string | undefined): Lang {
  return 'en'
}

export function formatNumber(lang: Lang, n: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits }).format(n)
}

export function formatBytes(lang: Lang, bytes: number): string {
  if (bytes < 1000) return translate(lang, 'unit.b', { n: formatNumber(lang, bytes) })
  if (bytes < 1000 * 1000) {
    const kb = bytes / 1000
    return translate(lang, 'unit.kb', { n: formatNumber(lang, kb, kb < 100 ? 1 : 0) })
  }
  return translate(lang, 'unit.mb', { n: formatNumber(lang, bytes / 1e6, 1) })
}
