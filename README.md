# Zats

**Send zats in a photo.** Send ZNN to a fresh address and get back an ordinary-looking photo with
the key to that address hidden in its pixels. Send the photo to a friend as a file; they open it,
paste their z1… address, and the ZNN moves to their wallet.

1 ZNN = 100,000,000 zats.

A fork of [Kakaonut](https://github.com/swedishfrenchpress/kakaonut) by Erik (MIT), which does the
same with Cashu ecash and Lightning. The photo side (steganography, PNG handling, the whole UI) is
Kakaonut's; the money side is Zenon.

> Proof of concept. Use small amounts.

Start with the simulated demo. Mainnet use requires a separately approved test of the exact
deployed revision; automated checks do not qualify real transfers. Follow the
[0.1 ZNN test guide](docs/mainnet-test.md). Run receipts and wallet details remain private.

How it works in detail, why it is built this way, what has been checked and what hasn't:
[docs/architecture.md](docs/architecture.md).

## How it works

```
 Sender                                  Chat app (as a file)          Friend
 ──────                                  ────────────────────          ──────
 1. choose a photo + an amount
 2. Zats makes a fresh Zenon account
    (24 words, generated in the browser)
    and saves it to History
 3. send ZNN to its z1… address
    from Syrius or any wallet
 4. the account's secret is written into
    the photo's pixels (PNG)
 5. download / share the photo ──────────▶ photo in a chat ──────────▶ 6. open it on Zats: it reads the
                                                                         pixels and shows the zats inside
                                                                      7. Claim: paste a z1… address. The
                                                                         page signs a receive block, then
                                                                         a send block, each with ~20 s of
                                                                         proof of work, and the photo is
                                                                         empty from then on
```

- **The secret.** 32 random bytes of BIP39 entropy, written as `zats1` + 64 hex characters (69
  bytes). Account 0 of its 24 words (the one Syrius opens) is the deposit address, so the words
  also work in Syrius.
- **No server, no mint.** The ZNN sits on the Zenon ledger; the photo is the key. The site is
  static and talks only to public Zenon nodes over WebSocket (`src/zenon.ts`).
- **Feeless, with proof of work.** The photo's account has no fused QSR, so every block it makes
  carries PoW, computed in a Web Worker with the SDK's WASM module (about 18 s per block on a recent
  laptop, longer on a phone).
- **Only ZNN and QSR count.** Zenon accounts get unsolicited airdrop tokens; Zats ignores them
  (each would cost the claimer two more PoW blocks). They stay in the account, reachable with the
  24 words.
- **Not private.** Unlike Cashu ecash, sender, photo account and claimer are linked on the public
  ledger. Hidden isn't encrypted either: anyone who knows the format can read the secret, so treat
  the photo like cash.

### Hidden-data format

Unchanged from Kakaonut except for the marker and the payload:

- PNG, 8-bit RGB. One bit in the lowest bit of R, G and B, pixel by pixel in row order.
- Frame: `"ZATS" | version 0x01 | length (u32, big-endian) | payload | CRC-32 (u32, big-endian)`.
  The payload is the `zats1…` secret.
- Up to 3 copies back to back; a damaged copy falls back to the next one, then to a bitwise
  majority vote. A photo reads as intact, repaired, damaged, erased (re-compressed) or empty.
- Reading never goes through `<canvas>` (anti-fingerprinting noise flips exactly those bits).

### Money safety

- The secret is saved to History (this device's localStorage) **before** its address is shown, so
  ZNN that arrives after a reload, a cancel or a closed tab can always be found and taken back.
- If storage fails, the 24 words are shown on screen to write down.
- History checks each account on the chain: Unclaimed, Claimed, Nothing arrived. Unclaimed photos
  can be taken back to any address.

## Run it

```sh
npm ci
npm run dev        # copies the SDK's pow.js/pow.wasm into public/pow/ first
npm test           # unit tests: stego, PNG, reader, secrets, addresses
npm run build && npx vite preview --port 4317 &
npm run e2e        # full make → fund → open → claim flow against a pretend node (needs Chrome)
npm run build:pages # combined mainnet site and /demo/ output in dist/
npm run e2e:pages   # both builds at a Pages project subpath, using simulated transfers only
```

Nodes: the public mainnet nodes from [blog.zenon.info/public-nodes](https://blog.zenon.info/public-nodes/),
tried in order. Override with `VITE_ZNN_NODES=wss://a:35998,wss://b:35998`.

## Design

The site floats on a small alien planet drawn live by code (`src/scene/scene.ts`): violet moss,
mushroom trees, crystals, a glowing pool, a dome habitat and a saucer that drops by now and then,
in isometric pixel art with a day/night cycle and weather (clear, mist, meteors). Panels are
frosted violet glass with a lime accent. The cast (an alien, a photo of its planet, the saucer) and
the logo are 16 × 16 and 7 × 7 pixel drawings; the hero photo is rendered by the scene code.

Type is pixel type, all SIL Open Font License: Tiny5 (headings, buttons, numbers), DotGothic16
(reading), Silkscreen (small caps) and VT323 (addresses), Latin subsets only.

## Demo build

`npm run build:demo` builds a version that needs no ZNN and no network (`dist-demo/`): a pretend
Zenon node runs inside the page (`src/demo.ts`), answering the same JSON-RPC calls with shapes
copied from mainnet and keeping its ledger in localStorage. A button stands in for Syrius on the
deposit screen, a made photo opens straight on Redeem (for hosts that block downloads), and
"Use a demo address" fills in a fresh z1 address. Keys and signatures are real; proof of work is
skipped. It runs under a strict CSP (own files only, no eval, no outside connections).

The demo uses separate History, pending-deposit and photo storage when hosted beside the mainnet
build. Never fund a demo address or open a funded photo in the demo.

## Hosting

Vercel serves the combined build at `/` and `/demo/`. Repository visibility is independent of
website hosting. Recovery material and private operational receipts must never be committed.
See the [Vercel and custom-domain guide](docs/vercel.md). Select the final production origin
before funding: browser History does not migrate automatically between domains.

The [Pages workflow](.github/workflows/pages.yml) tests and builds both sites on pushes. Publishing
is a separate manual action because a Pages website is publicly accessible even when its source
repository is private. See [hosting instructions](docs/hosting.md). No deployment or simulated test
qualifies a real mainnet claim.

## Licence

MIT. Kakaonut © 2026 Erik; the Zenon changes © 2026 edgepillar. See [LICENSE](LICENSE).
