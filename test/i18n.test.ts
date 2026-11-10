import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'
import { detectLang, formatBytes, translate, zatsUnit } from '../src/i18n/translate'

describe('dictionary', () => {
  it('has no empty values', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('')
  })

  it('keeps "zats" as the unit next to amounts', () => {
    expect(en['make.pay']).toContain('{amount} zats')
    expect(en['chat.label']).toContain('{amount} zats')
    expect(en['make.inside']).toContain('{amount} zats')
  })

  it('never mentions the Cashu or Lightning flow it was forked from', () => {
    for (const [key, value] of Object.entries(en)) {
      // These name the fork and its trade-offs on purpose.
      if (['footer.by', 'how.a.source', 'how.a.privacy.body', 'how.a.ecash.body'].includes(key)) continue
      expect(value, key).not.toMatch(/cashu|lightning|invoice|mint|kakao|원본|\bsats?\b/i)
    }
  })
})

describe('translate', () => {
  it('fills named placeholders', () => {
    expect(translate('en', 'make.pay', { amount: '1,000' })).toBe('Get an address for 1,000 zats')
  })

  it('keeps a trailing emoji on the same line as the word before it', () => {
    expect(translate('en', 'test.done', { count: 3 })).toBe('Done! 3 test photos ready 🎁')
    expect(translate('en', 'verdict.intact.title')).toBe('Intact ✨')
  })

  it('says "1 zat", but leaves 21 and 1,001 alone', () => {
    expect(translate('en', 'make.inside', { amount: '1' })).toBe('1 zat inside')
    expect(translate('en', 'make.done.title', { amount: '1' })).toBe('1 zat is hidden in your photo')
    expect(translate('en', 'make.inside', { amount: '21' })).toBe('21 zats inside')
    expect(translate('en', 'make.inside', { amount: '1,001' })).toBe('1,001 zats inside')
    expect([zatsUnit(1), zatsUnit(0), zatsUnit(2)]).toEqual(['zat', 'zats', 'zats'])
  })

  it('is English for now', () => {
    expect(detectLang('tr-TR')).toBe('en')
    expect(detectLang(undefined)).toBe('en')
  })

  it('formats file sizes', () => {
    expect(formatBytes('en', 512)).toBe('512 B')
    expect(formatBytes('en', 252_000)).toBe('252 KB')
    expect(formatBytes('en', 6_123_456)).toBe('6.1 MB')
  })
})
