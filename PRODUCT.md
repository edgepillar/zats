# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: receivers.** People who get a photo from a friend on KakaoTalk, usually on a phone, and may never have used bitcoin. They need to understand that the photo holds money and finish taking it. Every screen must make sense with no crypto knowledge.
- **Secondary: senders.** Bitcoiners (for example at bitcoin++ Seoul) who want to gift sats to a friend inside a photo.

## Product Purpose

Kakaonut hides Cashu ecash in an ordinary-looking PNG photo, so bitcoin can be sent over KakaoTalk like any picture. Two actions carry the product:

- **Hide bitcoin in a photo:** pick a photo and an amount, pay a Lightning invoice, get the photo back with the ecash in its pixels.
- **Redeem a photo:** paste or choose a photo you received, see the amount, then claim it in the Kakaonut Wallet, copy the token, or send it to a Lightning address.

Success: a receiver who has never used bitcoin opens the photo and ends up holding the money.

## Positioning

The photo itself is the money: a bearer instrument hidden in the lowest bits of the pixels, travelling through the chat app people already use. No account, no backend, nothing to install to send. Built for KakaoTalk and bilingual (English and Korean).

## Operating Context

- Built for bitcoin++ Seoul, privacy edition (hackathon).
- Photos travel through KakaoTalk. They must be sent as 원본 (Original) or as a file; normal quality re-compresses to JPEG and erases the data.
- Two deployables: the static site (kakaonut.com) and the Kakaonut Wallet, a fork of cashu.me (wallet.kakaonut.com, currently kakaonut-wallet.vercel.app).
- Receivers are mostly on phones inside KakaoTalk; senders on a phone or a laptop.

## Capabilities and Constraints

- Real bitcoin only, through the Minibits mint. The test mint is used only by automated test builds.
- Static site: no backend, no accounts, no analytics. Network requests go to the Cashu mint, Coinbase (bitcoin price for display) and, when sending to a Lightning address, that address's provider.
- Hidden-data format is fixed and shared with the wallet: PNG RGB least significant bits, `SATS` frame with length and CRC-32, up to three copies, repaired by majority vote; reading never goes through a canvas.
- English and Korean for every string. Mobile first, 360 px minimum.
- Not affiliated with Kakao: no Kakao characters, logos or product names (for example no "KakaoWallet"). Kakaonut uses its own K logo and its own characters (a coin, a photo, a bolt).
- Terminology: "photos", never "stickers". "bitcoin" in prose; "sats" only right after a number. Amounts show dollars (English) or 원 (Korean) first, sats underneath.

## Brand Commitments

- Name: Kakaonut (카카오넛). Wallet: Kakaonut Wallet.
- The owner has made the KakaoTalk look binding: white pages, bold ink type, KakaoTalk yellow, rounded shapes, no shadows, light mode only, own K logo.
- Voice: short, plain and friendly. No disclaimer clutter, no emoji used as icons, nothing that reads as generic AI-made UI (the owner's repeated feedback).

## Evidence on Hand

- KakaoTalk survival log: `KAKAOTALK_RESULTS.md`. Tested: KakaoTalk for Mac → chat → iPhone came back byte-for-byte identical. Sending from a phone is not tested yet.
- No testimonials, user numbers, partners or press exist; do not invent any.

## Product Principles

1. Receivers first: someone with no bitcoin knowledge must understand the photo and finish redeeming it.
2. Never lose money: save the invoice before showing it, save the token before hiding it, keep the photo through reloads, and show the raw token if saving fails.
3. Show the amount, not the plumbing: technical detail lives in How it works › Advanced.
4. Nothing leaves the device except what has to reach the mint.

## Accessibility & Inclusion

- English and Korean throughout; Korean is a first-class language, not a translation afterthought.
- Respects reduced motion (loaders and explainers stand still).
- Works on 360 px phones.
