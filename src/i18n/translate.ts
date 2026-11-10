import { en, type Dict, type Key } from './en'
import { ko } from './ko'

export type Lang = 'en' | 'ko'
export type Vars = Record<string, string | number>

export const dictionaries: Record<Lang, Dict> = { en, ko }
export const LANGS: Lang[] = ['en', 'ko']

// A trailing emoji should never wrap onto a line of its own.
const TRAILING_EMOJI = / ((?:\p{Extended_Pictographic}\uFE0F?)+)$/u

// One sat, not "1 sats" (and "1 sat is", not "1 sat are"). Not preceded by a digit, so 21 and 1,001 stay.
const ONE_SATS = /(?<![\d.,])1 sats\b/g
const ONE_SAT_ARE = /(?<![\d.,])1 sat are\b/g

/** "sat" for exactly one, "sats" otherwise. */
export function satsUnit(n: number): string {
  return n === 1 ? 'sat' : 'sats'
}

/** Fills named placeholders like {amount}. Unknown placeholders are left as they are. */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const template = (dictionaries[lang][key] || en[key]).replace(TRAILING_EMOJI, '\u00A0$1')
  if (!vars) return template
  return template
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
    .replace(ONE_SATS, '1 sat')
    .replace(ONE_SAT_ARE, '1 sat is')
}

export function detectLang(navigatorLanguage: string | undefined): Lang {
  return navigatorLanguage?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
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
