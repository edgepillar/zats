import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'
import { ko } from '../src/i18n/ko'
import { detectLang, formatBytes, satsUnit, translate } from '../src/i18n/translate'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('dictionaries', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort())
  })

  it('have no empty values', () => {
    for (const dict of [en, ko]) {
      for (const [key, value] of Object.entries(dict)) expect(value.trim(), key).not.toBe('')
    }
  })

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('keep "sats" as the unit next to amounts, in both languages', () => {
    expect(ko['ln.change']).toContain('{amount} sats')
    expect(ko['make.pay']).toContain('{amount} sats')
    expect(en['chat.label']).toContain('{amount} sats')
    expect(ko['chat.label']).toContain('{amount} sats')
  })
})

describe('translate', () => {
  it('fills named placeholders', () => {
    expect(translate('en', 'ln.change', { amount: '1,000' })).toBe('Claim the 1,000 sats left over')
    expect(translate('ko', 'ln.change', { amount: '1,000' })).toBe('남은 1,000 sats 받기')
  })

  it('keeps a trailing emoji on the same line as the word before it', () => {
    expect(translate('en', 'test.done', { count: 3 })).toBe('Done! 3 test photos ready\u00A0🎁')
    expect(translate('en', 'verdict.intact.title')).toBe('Intact\u00A0✨')
  })

  it('says "1 sat", but leaves 21 and 1,001 alone', () => {
    expect(translate('en', 'ln.change', { amount: '1' })).toBe('Claim the 1 sat left over')
    expect(translate('en', 'make.done.title', { amount: '1' })).toBe('1 sat is hidden in your photo')
    expect(translate('en', 'ln.change', { amount: '21' })).toBe('Claim the 21 sats left over')
    expect(translate('en', 'ln.change', { amount: '1,001' })).toBe('Claim the 1,001 sats left over')
    expect(translate('ko', 'ln.change', { amount: '1' })).toBe('남은 1 sat 받기')
    expect([satsUnit(1), satsUnit(0), satsUnit(2)]).toEqual(['sat', 'sats', 'sats'])
  })

  it('picks Korean for any ko-* browser language', () => {
    expect(detectLang('ko-KR')).toBe('ko')
    expect(detectLang('ko')).toBe('ko')
    expect(detectLang('en-US')).toBe('en')
    expect(detectLang(undefined)).toBe('en')
  })

  it('formats file sizes', () => {
    expect(formatBytes('en', 512)).toBe('512 B')
    expect(formatBytes('en', 252_000)).toBe('252 KB')
    expect(formatBytes('en', 6_123_456)).toBe('6.1 MB')
  })
})
