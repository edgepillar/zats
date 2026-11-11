/** 1,000 ZNN. This proof of concept is intended for small amounts. */
export const MAX_AMOUNT = 100_000_000_000

export type ZatsAmount =
  | { value: number; error: null }
  | { value: null; error: 'invalid' | 'whole' | 'max' }

/** Accept whole zats and well-formed thousands grouping; never remove a decimal or a sign. */
export function parseZats(text: string): ZatsAmount {
  const clean = text.normalize('NFKC').trim()
  if (/[.\u066b]/.test(clean)) return { value: null, error: 'whole' }
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,3}(?: [0-9]{3})+)$/.test(clean)) {
    return { value: null, error: 'invalid' }
  }
  const value = Number(clean.replace(/[ ,]/g, ''))
  if (!Number.isSafeInteger(value) || value > MAX_AMOUNT) return { value: null, error: 'max' }
  return value >= 1 ? { value, error: null } : { value: null, error: 'invalid' }
}
