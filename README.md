# Kakaonut (카카오넛)

**Send bitcoin in a photo.** Pay a Lightning invoice and get back an ordinary-looking photo with
bitcoin hidden in its pixels. Send it to a friend on KakaoTalk. They paste it into the Kakaonut
Wallet, watch it scan the photo, and claim what's inside.

Built for bitcoin++ Seoul, privacy edition.

> Kakaonut is an independent hackathon project, not affiliated with or endorsed by Kakao Corp.
> KakaoTalk is a trademark of Kakao Corp.

## How it works

```
 Sender (kakaonut.com)                    KakaoTalk               Friend (wallet.kakaonut.com)
 ─────────────────────                    ─────────               ────────────────────────────
 1. choose a photo + an amount
 2. pay a Lightning invoice   ──▶ Cashu mint issues ecash
 3. ecash is written into the
    photo's pixels (PNG)
 4. download / share the photo ─────────▶ photo in a chat ─────▶ 5. paste the photo
                                                                  6. wallet reads the pixels,
                                                                     shows the amount
                                                                  7. Claim: the wallet swaps
                                                                     the ecash at the mint ✓
```

1. **Bitcoin becomes ecash.** The site asks a [Cashu](https://cashu.space) mint for a Lightning
   invoice. Once it's paid, the mint issues ecash: a short string of signed tokens worth that
   amount. Whoever holds the string can spend it, like cash.
2. **The ecash goes into the pixels.** Every pixel has a red, green and blue value from 0 to 255.
   Kakaonut changes only the last bit of each value, so a colour moves by at most 1 out of 255,
   which the eye can't see. Those last bits, read in order, spell out the ecash.
3. **The photo travels as a PNG.** PNG is lossless, so the bits survive as long as nothing
   re-compresses the photo. A JPEG conversion erases them, which the reader reports as "erased"
   rather than guessing.
4. **The wallet reads it back.** The Kakaonut Wallet (a fork of [cashu.me](https://cashu.me))
   decodes the PNG itself, finds the hidden ecash, checks it with the mint, and shows the amount
   with a scan animation. **Claim** swaps the ecash for fresh tokens in the friend's wallet, so the
   photo is now empty: anyone who opens it later sees "already claimed".
5. **Or straight to Lightning.** On the site's Open page the friend can instead type a Lightning
   address. The browser looks up the address, gets an invoice for the photo's amount, and asks the
   mint to pay it with the photo's ecash ("melting"). The mint's fee comes out of the amount and any
   unused fee reserve comes back as ecash. If the payment fails, nothing is spent.

### Hidden-data format

The site and the wallet share this format and the same code (`src/stego.ts`, `src/png.ts`):

- PNG, 8-bit RGB. One bit in the lowest bit of R, G and B, pixel by pixel in row order.
- Frame: `"SATS" | version 0x01 | length (u32, big-endian) | payload | CRC-32 (u32, big-endian)`.
  The payload is a Cashu token (`cashuB…`).
- Up to 3 copies of the frame back to back. If a copy is damaged, the reader tries the others and
  then a bit-by-bit majority vote across all three, so a photo can be **intact**, **repaired**,
  **damaged**, **erased** (re-compressed) or have **nothing hidden**.
- Reading never goes through a browser `<canvas>`. Some browsers add fingerprinting noise to canvas
  pixels, which would flip exactly the bits that matter. PNGs are decoded with
  [`fast-png`](https://github.com/image-js/fast-png) instead.

### Privacy

- **No backend.** The site is static: no accounts, no analytics, fonts are self-hosted. Network
  requests go to the Cashu mint, and to Coinbase for the bitcoin price when a photo with bitcoin in
  it is opened (to show the amount in dollars or won).
- **The mint can't link payer and receiver.** Cashu uses blind signatures: the mint signs tokens
  without seeing them, so it can't connect the person who paid the invoice to the person who
  claims the photo.
- **Your photo stays on your device.** It's resized and re-encoded in the browser. The new PNG
  carries no EXIF, location or dates from the original.
- **A photo is cash.** Anyone who has the photo and knows to look can claim it, and the data is
  hidden, not encrypted. Only send it to the person it's for. Until it's claimed, the sender can
  take the bitcoin back from History on the site.

## What's in this repo

| Folder | What | Deploys to |
|---|---|---|
| `/` | The site: Vite + React + TypeScript, English and Korean | kakaonut.com |
| `wallet/` | Kakaonut Wallet, a fork of cashu.me (Vue 3 + Quasar PWA) | wallet.kakaonut.com |

**The site** has three pages:

- **Make** (home): an animated KakaoTalk chat shows the idea, then choose a photo → amount → Pay →
  Lightning invoice → your photo with the bitcoin inside, with Download, Share and Copy. Photos hold
  real bitcoin, through the Minibits mint. The invoice is saved before it's shown and picked up
  again after a reload, and the ecash is saved on the device before it goes into the photo, so a
  crash or a closed tab doesn't lose the money.
- **Open** (footer link): checks any image and says what's inside: amount, mint, whether it's been
  claimed, or why nothing could be read. If there's bitcoin inside it shows a money message: the
  amount in dollars (won in Korean) with sats underneath, then **Claim in Kakaonut** (opens the
  wallet with it), **Copy** (the ecash token) and **Send to Lightning** (pays a Lightning address
  from the browser; works with providers that allow requests from websites, which most do).
- **KakaoTalk test** (footer link): makes three test photos with fake data (no money) to check
  which ways of sending through KakaoTalk keep the hidden bits. Results so far are in
  [`KAKAOTALK_RESULTS.md`](KAKAOTALK_RESULTS.md).

**The wallet** is cashu.me with a few changes: it skips onboarding and opens on an empty wallet with
the Minibits mint connected, it has a **Paste photo** button (also Receive → Ecash → Photo, or paste
anywhere), a KakaoTalk-style light theme with the K logo, and a Korean translation. Claiming uses
cashu.me's normal receive path. See [`wallet/UPSTREAM.md`](wallet/UPSTREAM.md) for what changed.

## Run it

The site:

```sh
npm install
npm run dev          # http://localhost:5173
npm run dev:lan      # also on your Wi-Fi, for phones (http only: no Share or clipboard buttons)
npm test             # unit tests (vitest)
npm run e2e          # Playwright end-to-end tests (needs network for the test mint)
                     # e2e builds with VITE_TEST_MINT=1, so tests use fake test-mint bitcoin
npm run build        # static site in dist/
```

The wallet:

```sh
cd wallet
npm ci
E2E=true npx quasar dev --port 8080   # http://localhost:8080
npx vitest run                        # unit tests, including the shared test photo
npm run build:pwa                     # installable PWA in dist/pwa
```

Both together, end to end (the site makes a photo, the wallet claims it), with the wallet running:

```sh
WALLET_URL=http://localhost:8080/ npm run e2e -- wallet.spec.ts
```

Share and the clipboard need HTTPS, so test on a phone through a deployed copy.

## Deploying

One repo, two Vercel projects:

| Project | Root directory | Domain | Settings |
|---|---|---|---|
| Site | `/` | kakaonut.com | Vite preset (build `npm run build`, output `dist`) |
| Wallet | `wallet/` | wallet.kakaonut.com | from `wallet/vercel.json` (build `npm run build:pwa`, output `dist/pwa`) |

"Claim in Kakaonut" links to `https://kakaonut-wallet.vercel.app` until the domain is set up. Set
`VITE_WALLET_URL` on the site project (for example `https://wallet.kakaonut.com`) to change it.

## Code map

```
src/
  stego.ts png.ts        hidden-data format (shared with the wallet, keep identical)
  read.ts                read a photo: intact / repaired / damaged / erased / none
  sticker.ts             hide a token in pixels → encode PNG → read it back to check
  photo.ts               photo → resized RGB pixels
  imageInfo.ts           format and pixel size from the file's first bytes
  mint.ts                Cashu mint calls (cashu-ts): invoice, mint, claim state, pay a Lightning address
  lightning.ts           Lightning address → invoice (LUD-16 / LNURL-pay)
  config.ts              where "Claim in Kakaonut" points
  price.ts               bitcoin price for dollars / won
  wallet.ts              pending invoice and saved tokens (localStorage)
  worker.ts              heavy pixel work off the main thread
  i18n/                  English and Korean
  components/ screens/
test/                    unit tests and the shared test photo (fixtures/)
e2e/                     Playwright tests
wallet/src/js/kakaonut/  the wallet's copy of the format and reader, plus setup
wallet/src/components/PhotoClaimDialog.vue   paste → scan → reveal → claim
```

`test/fixtures/kakaonut-fixture.png` holds a test-mint token. Both test suites read it, so the
site and the wallet are checked against the same photo. Regenerate it with
`npx vite-node scripts/make-fixture.ts` and copy both fixture files into
`wallet/test/vitest/__tests__/fixtures/`.

## Credits

Ecash by [Cashu](https://cashu.space) and [cashu-ts](https://github.com/cashubtc/cashu-ts). The
wallet is a fork of [cashu.me](https://github.com/cashubtc/cashu.me) (MIT). PNG decoding by
[fast-png](https://github.com/image-js/fast-png). Fonts: [Pretendard](https://github.com/orioncactus/pretendard)
and [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) (both SIL Open Font License).

MIT licensed, see [LICENSE](LICENSE).
