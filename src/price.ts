import { useEffect, useState } from 'react'
import type { Lang } from './i18n/translate'

/**
 * Bitcoin price, to show amounts in dollars (English) or won (Korean). Same source as the
 * wallet (Coinbase). Only fetched once a photo with bitcoin in it is opened.
 */

export interface BtcPrice {
  USD: number
  KRW: number
}

let request: Promise<BtcPrice> | undefined
let latest: BtcPrice | undefined

export function loadBtcPrice(): Promise<BtcPrice> {
  request ??= fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC')
    .then((r) => r.json())
    .then((j: { data?: { rates?: Record<string, string> } }) => {
      const price = { USD: Number(j.data?.rates?.USD), KRW: Number(j.data?.rates?.KRW) }
      if (!(price.USD > 0) || !(price.KRW > 0)) throw new Error('no price')
      latest = price
      return price
    })
  request.catch(() => {
    request = undefined
  })
  return request
}

/** The price, or null while loading or if it can't be fetched (then show sats only). */
export function useBtcPrice(): BtcPrice | null {
  const [price, setPrice] = useState<BtcPrice | null>(latest ?? null)
  useEffect(() => {
    if (latest) return
    let live = true
    loadBtcPrice()
      .then((p) => live && setPrice(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return price
}

/** The price if this visit already fetched it, without fetching. For illustrations like the hero. */
export function peekBtcPrice(): BtcPrice | null {
  return latest ?? null
}

/** "$0.98" in English, "1,432원" in Korean. */
export function formatFiat(sats: number, price: BtcPrice, lang: Lang): string {
  const btc = sats / 1e8
  if (lang === 'ko') {
    const won = btc * price.KRW
    if (won < 1) return '1원 미만'
    return `${new Intl.NumberFormat('ko-KR').format(Math.round(won))}원`
  }
  const usd = btc * price.USD
  if (usd < 0.01) return '<$0.01'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd)
}
