/**
 * Where "Claim in Kakaonut" sends people. The token goes in the URL fragment (#token=…), which the
 * browser never sends to the server. Set VITE_WALLET_URL to override, e.g. once wallet.kakaonut.com
 * is set up.
 */
export const WALLET_URL = ((import.meta.env.VITE_WALLET_URL as string | undefined) || 'https://kakaonut-wallet.vercel.app').replace(
  /\/+$/,
  '',
)

export const claimLink = (token: string) => `${WALLET_URL}/#token=${token}`
