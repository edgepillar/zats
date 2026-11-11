import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT, parseZats } from '../src/amount'

describe('whole-zats input', () => {
  it('accepts plain digits and complete English thousands grouping', () => {
    for (const text of ['150000000', '150,000,000', '150 000 000', '１５０００００００', '150\u202f000\u202f000']) {
      expect(parseZats(text), text).toEqual({ value: 150_000_000, error: null })
    }
    expect(parseZats('1')).toEqual({ value: 1, error: null })
    expect(parseZats('100,000,000,000')).toEqual({ value: MAX_AMOUNT, error: null })
  })

  it('never turns decimals, signs, exponents or malformed grouping into a different amount', () => {
    for (const text of ['1.5', '1.', '１．５', '1\u066b5', '0,1', '1,5', '12,34', '1,000 000', '-1', '+1', '1e3', '1_000', '1x5']) {
      expect(parseZats(text).value, text).toBeNull()
    }
    expect(parseZats('1.5').error).toBe('whole')
    expect(parseZats('１．５').error).toBe('whole')
  })

  it('rejects empty, zero and excessive amounts without truncating digits', () => {
    for (const text of ['', ' ', '0', '000']) expect(parseZats(text).value, text).toBeNull()
    for (const text of ['100000000001', '100,000,000,001', '999999999999999999999']) {
      expect(parseZats(text), text).toEqual({ value: null, error: 'max' })
    }
  })
})
