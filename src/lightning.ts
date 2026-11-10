/**
 * Lightning addresses (LUD-16): name@domain → https://domain/.well-known/lnurlp/name → an LNURL-pay
 * endpoint that returns a bolt11 invoice for a given amount. Everything runs in the browser, so it
 * only works with providers that allow cross-origin requests (most do).
 */

export type LnErrorCode = 'invalid' | 'notFound' | 'blocked' | 'range' | 'invoice'

export class LnAddressError extends Error {
  constructor(
    readonly code: LnErrorCode,
    readonly detail: { domain?: string; min?: number; max?: number } = {},
  ) {
    super(code)
  }
}

export interface PayEndpoint {
  address: string
  domain: string
  callback: string
  /** sats */
  min: number
  /** sats */
  max: number
}

const ADDRESS = /^([a-z0-9._+-]+)@((?:[a-z0-9-]+\.)+[a-z0-9-]{2,})$/i

/** Normalises "Name@Wallet.com" or "lightning:name@wallet.com". Null if it isn't an address. */
export function parseLightningAddress(input: string): { user: string; domain: string; address: string } | null {
  const s = input.trim().replace(/^lightning:/i, '')
  const m = ADDRESS.exec(s)
  if (!m) return null
  const user = m[1].toLowerCase()
  const domain = m[2].toLowerCase()
  return { user, domain, address: `${user}@${domain}` }
}

async function getJson(url: string, domain: string): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    // Offline, unknown domain, or the provider doesn't allow requests from websites (CORS).
    throw new LnAddressError('blocked', { domain })
  }
  let body: Record<string, unknown>
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    throw new LnAddressError('notFound', { domain })
  }
  if (!res.ok || String(body.status ?? '').toUpperCase() === 'ERROR') throw new LnAddressError('notFound', { domain })
  return body
}

export async function resolveLightningAddress(input: string): Promise<PayEndpoint> {
  const parsed = parseLightningAddress(input)
  if (!parsed) throw new LnAddressError('invalid')
  const { user, domain, address } = parsed
  const body = await getJson(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`, domain)
  if (body.tag !== 'payRequest' || typeof body.callback !== 'string') throw new LnAddressError('notFound', { domain })
  const min = Math.ceil(Number(body.minSendable) / 1000)
  const max = Math.floor(Number(body.maxSendable) / 1000)
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new LnAddressError('notFound', { domain })
  return { address, domain, callback: body.callback, min, max }
}

/** Asks the address's provider for an invoice of exactly `sats`. */
export async function fetchInvoice(endpoint: PayEndpoint, sats: number): Promise<string> {
  if (sats < endpoint.min || sats > endpoint.max) {
    throw new LnAddressError('range', { min: endpoint.min, max: endpoint.max })
  }
  const url = new URL(endpoint.callback)
  url.searchParams.set('amount', String(sats * 1000))
  const body = await getJson(url.toString(), endpoint.domain)
  if (typeof body.pr !== 'string' || !body.pr) throw new LnAddressError('invoice', { domain: endpoint.domain })
  return body.pr
}
