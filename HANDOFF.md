# Handoff: Zats

Read this first. It is everything the previous working session knew that the code alone doesn't
tell you: where the project came from, what was decided and why, what was verified (and how), what
was **not** verified, and what to do next. Written 2026-11-11 at the end of the session that built
the project. The project account is **edgepillar** on GitHub. Code, UI copy, documentation and
repository communication are in English.

---

## 1. What this is, in one paragraph

Zats is a static web app that hides Zenon (ZNN) in an ordinary-looking PNG. The sender gets a fresh,
single-use Zenon account generated in the browser, sends ZNN to it from Syrius or any wallet, and
the account's secret (`zats1` + 64 hex chars of BIP39 entropy) is written into the lowest bits of
the photo's pixels. Whoever opens the photo on the site can move the ZNN to their own z1 address
(the page signs a receive block and a send block, each with ~20 s of in-browser proof of work).
1 ZNN = 100,000,000 **zats** (ZNN has 8 decimals). No server, no mint, no accounts; the site talks
only to public Zenon nodes over WebSocket.

It is a fork of **Kakaonut** (Erik / `swedishfrenchpress/kakaonut`, MIT, commit `6986c8a`), which
does the same with Cashu ecash over Lightning and is what <https://magical.cash> is built on. The
photo side (steganography, PNG handling, most UI structure) is Kakaonut's; the money side, the
visual design and the demo mode are new.

## 2. State at handoff

| Area | State |
| --- | --- |
| Git | 6 commits on `master` in a local repo; **not pushed anywhere yet**. No remote. |
| Unit tests | `npm test`: 31 pass (stego, PNG reader, i18n, secrets/addresses/amounts). |
| E2E (real build) | `npm run e2e`: make → fund → open → claim against a pretend node (`e2e/fake-node.js`) with **real** PoW and signing. PASS. |
| E2E (demo build) | `npm run e2e:demo`: same flow in the demo build under a strict CSP; also with `NO_STORAGE=1`. PASS. |
| Mainnet | Read-only paths verified live (see §6). **Publishing real blocks has never been tried.** |
| Demo | Previously previewed in a private session; rebuild locally with `npm run build:demo`. |
| Hosting | None yet. GitHub Pages is the plan (§8). |

## 3. How it works

### The secret and the photo

- `newSecret()` (`src/zenon.ts`) makes a `KeyStore.newRandom()` with `znn-typescript-sdk`; the
  token is `'zats1' + entropy.toLowerCase()` (69 bytes). Account **0** of those 24 words is the
  deposit address: the same one Syrius opens, so the words are a fallback wallet.
- Frame written into the PNG (unchanged from Kakaonut except the marker):
  `"ZATS" | version 0x01 | u32 length | payload | CRC-32`, up to 3 copies, 1 bit in the LSB of each
  R, G, B, row order. Reader decodes PNG itself (never via `<canvas>`: anti-fingerprinting noise
  flips exactly those bits), tries each copy, then a bitwise majority vote. Outcomes: intact,
  repaired, damaged, erased (re-compressed), none. See `src/stego.ts`, `src/png.ts`, `src/read.ts`.
- `src/read.ts` accepts a payload only if it starts with `zats` (real secrets and test-mode payloads).

### Make (sender) — `src/components/MakeFlow.tsx`

1. Photo + amount (in zats; presets 0.1/0.5/1/5 ZNN; max 1,000 ZNN as a PoC guard).
2. `newSecret()` → **saved to History (localStorage `zats.tokens`) before the address is shown**,
   plus a pending record (`zats.pending`) and the photo in IndexedDB (`photoStore.ts`), so a reload,
   a cancel or a closed tab never loses ZNN that arrives later.
3. Poll `accountState(address)` every 3 s until **ZNN > 0** (QSR alone or airdrop spam doesn't count).
4. Embed in a Web Worker, show the PNG (download / share / copy).

### Open + claim (receiver) — `RedeemFlow.tsx`, `ClaimCard.tsx`, `SweepForm.tsx`

- Read the PNG → `summarizeToken` (amount in zats, plus QSR) → `checkClaimState`
  (`unspent` / `pending` = unconfirmed blocks on the account / `spent`).
- Claim = `sweep(token, to)`: receive every unreceived ZNN/QSR transfer, wait for them to settle
  (no unreceived, no unconfirmed), then one send block per token with the full balance. Each block:
  `z.send(template, keyPair)` — the SDK autofills height/previous hash/momentum, asks
  `embedded.plasma.getRequiredPoWForAccountBlock`, runs WASM PoW in its worker, signs, publishes.
  `waitForFrontier` polls until the node shows the new block as the account's frontier.
- History (`SavedItem`) re-checks each account on the chain when the list is opened, and can
  "Take back" (same sweep, to the sender's address) or "Put in a photo" for a funded secret that
  never got one.

### Only ZNN and QSR

`KEPT = {ZNN, QSR}` in `src/zenon.ts`. Found live: mainnet accounts receive unsolicited airdrop
tokens (GLYPH, PP, FARTCOIN…). Counting them would let spam "fund" a photo with 0 zats, and moving
them would cost the claimer two extra PoW blocks each. They stay in the account; the 24 words reach
them. Unreceived blocks are paged (up to 10 × 50) and filtered.

### Nodes

`wss://node.atsocy.com:35998`, `wss://node.zenonhub.io:35998`, `wss://my.hc1node.com:35998`
(from <https://blog.zenon.info/public-nodes/>), tried in that order (fastest measured first).
Override with `VITE_ZNN_NODES=wss://a:35998,wss://b:35998`. All three accepted WebSocket
connections from a third-party browser origin (tested from a browser on 2026-11-11;
mainnet, `chainIdentifier` 1). WebSocket has no CORS; servers could still filter by `Origin`.

### Proof of work

The SDK's `pow.js` + `pow.wasm` are copied to `public/pow/` by `scripts/copy-pow.mjs` (runs before
dev/build/preview) and loaded via `Zenon.setPowBasePath(BASE_URL + 'pow/')`. A basic block needs
21,000 plasma × 1,500 = difficulty **31,500,000**.

## 4. Demo mode — `src/demo.ts`

`npm run build:demo` → `dist-demo/` (sets `VITE_DEMO=1`). Replaces `window.WebSocket` with an
in-page pretend node that answers the same JSON-RPC calls with shapes **copied from a live mainnet
node**, keeps its ledger in localStorage (`zats.demo.chain`), validates height/previousHash/signature
on publish, returns `requiredDifficulty: 0` (no PoW) and delays each publish 1.6 s. UI changes in
demo: a "Send from a pretend wallet" button on the deposit screen, "Open it on Redeem" instead of
Download (artifact hosts block downloads), "Use a demo address" on the claim form, no explorer
links, a banner, and no "write down your 24 words" warnings when storage is unavailable.
It runs under a strict CSP (own files only, no eval, no outside connections); verified with and
without localStorage.

## 5. Design

Requested by the owner in steps: (1) design language like <https://www.inspora.design/posts/pixel-art-farm>
(Daniil Ch.: cozy isometric pixel art, frosted-glass panels, day/night + weather controls in a glass
panel and a bottom dock), (2) pixel font, (3) alien theme. **Nothing was copied from that work**:
the scene is original procedural code; only the style was the brief.

- `src/scene/scene.ts`: an endless isometric alien world drawn by code at low resolution
  (3 CSS px per art px, 2 on phones) and scaled with `image-rendering: pixelated`. Value noise →
  violet moss, teal patches, craters, mushroom trees, crystals, orb plants, fronds; hand-placed
  clearing: dome habitat, glowing pool, sprout garden, metal-plate path, beacons, a dish. Painted
  once into a colour buffer and a **glow buffer**; each frame (20 fps, paused when hidden) adds pool
  glints, spores, a visiting saucer with a beam, a multiply tint per time of day, the glow layer
  (brighter at night), radial lights near the clearing, mist or meteors. Reduced motion → one still
  frame (saucer hovering). `size` + `focus` options render fixed pictures: the hero chat photo
  (`src/assets/hero-photo-{1,2,3}x.webp`, 178 × 133 art px, nearest-neighbour ×2/×3) was made that way.
- `src/scene/sky.ts` + `src/components/SkyDock.tsx`: time of day (morning/day/evening/night) and
  weather (clear/mist/meteors), "Follow my clock" (default) and "Let it change" (drift every 3 min),
  saved per viewer (`zats.sky`); "Look around" fades the page to show the world.
- `src/components/Buddies.tsx`: the cast as 16 × 16 pixel art (kinds keep old names: `coin` = alien,
  `photo` = planet polaroid, `bolt` = saucer). `Logo.tsx`: 7 × 7 pixel Z. Favicons regenerated to match.
- Type (all SIL OFL, Latin subsets only): **Tiny5** display, **DotGothic16** reading, **Silkscreen**
  small caps/footer, **VT323** addresses and the 24 words. `font-synthesis: none` (single-weight
  pixel faces must not get fake bold). **Pixelify Sans was tried and dropped: its capital Z reads as
  a 2** ("2NN", "2enon"). Pixel faces get `letter-spacing: 0`.
- CSS: Kakaonut's stylesheet is intact; the theme is **appended layers at the end of
  `src/styles.css`** ("Zats theme…", "Round four…", "Round five…") that re-point the CSS variables
  and restyle surfaces. Palette: violet glass `rgba(22,15,42,.62)` + blur, lime accent `#c9f26b`
  on `#140f22`, lavender-white text. If you refactor CSS, fold these layers into the base rules.

## 6. What was verified, and how

- **Live mainnet, read-only** (a browser, `zenon.ts` bundled and loaded on a page, SDK 1.0.5
  from jsDelivr): new secret → address round trip, 24 words; `accountState` on a fresh account;
  ZNN sums for 4 real accounts **equal raw `ledger.getAccountInfoByAddress` + unreceived sums**;
  spam filtering; paging an account with 11 unreceived ZNN/QSR blocks; `sweep` on an empty account
  refuses with `empty` before any PoW.
- **PoW timing**: `prepareBlock` (PoW + signature, **not published**) took **17.8 s** in a desktop
  Chrome browser (difficulty 31.5 M confirmed); 28.7–30.5 s single-thread WASM on a server.
  Phones: unmeasured.
- **go-zenon source** (cloned for reading): plasma constants as above; account blocks have no
  "momentum acknowledged too old" rule (only a gap rule vs the previous block), so ~20 s of PoW
  doesn't invalidate a block; `ledger.getFrontierAccountBlock` reads the **account pool** (includes
  unconfirmed blocks), so chained blocks build correctly; **HTLC unlock always pays the
  `HashLocked` address** (proxy unlock defaults on, but funds still go there), so HTLCs can't be the
  bearer instrument.
- BIP39 vector: all-zero entropy → "abandon ×23 art" (unit test).
- Fake-node E2E checks heights, previous hashes, signatures and non-zero nonces on all 4 blocks.

### NOT verified — do these before anyone uses it with real money

1. **A real mainnet claim.** Make a photo with **0.1 ZNN**, claim it in another browser to a
   second address, and record the tx hashes. Watch for: the settle wait (receives must confirm
   before the send reads the balance), node errors surfacing as `SweepError('failed')`.
2. Phone PoW time (expect slower than 18 s × 2). If too slow: do the receive on the Make side
   (sender waits once, claimer once), or let the sender fuse QSR to the photo account.
3. Chat-app survival of the PNG with this payload (Kakaonut's notes: KakaoTalk original/file OK,
   Telegram as file OK, Signal erases). The hidden `#test` page makes fake test photos at 3 sizes.
4. Node `Origin` filtering for the final hosting domain (re-test the three nodes from it).

## 7. Decisions and why

- **Ephemeral key, not a Zenon-backed Cashu mint**: fastest to build, non-custodial. Cost: **no
  privacy** (sender → photo account → claimer is public). Stated in the UI's Advanced section.
- **Hex token in the PNG** (not raw 32 bytes): keeps Kakaonut's string-based worker/sticker/reader
  untouched.
- **ZNN-only trigger for deposits**, ZNN+QSR for sweeps (spam, see §3).
- **Sweep waits for confirmation** before sending, even though the frontier includes unconfirmed
  blocks: the balance must be certain.
- **E2E rewritten** (Kakaonut's Playwright suite depended on a self-paying Cashu test mint; there's
  no Zenon equivalent): puppeteer-core + system Chrome + pretend node.
- **English only** for now; Korean removed. `src/i18n/translate.ts` takes more dictionaries.
- Kakaonut's hidden routes `#open` (chat-style reader) and `#test` (chat-app test photos) are kept.

## 8. Original next steps (superseded by the current maintainer request)

1. **Create the GitHub repo** (`edgepillar/zats`) with the visibility selected by the maintainer.
   Before the first push, rewrite every author and committer to
   `edgepillar <179010287+edgepillar@users.noreply.github.com>`. Remove private session links and
   session-specific handoff details from every reachable revision. Preserve the original bundle
   and the old-to-new commit mapping privately. Audit all branches and tags before publication.
2. Prepare a 0.1 ZNN mainnet test guide from §6. Every real-fund action requires explicit approval.
3. Prepare GitHub Pages via Actions before the mainnet test: `npm ci && npm run build` → `dist/` (real site), optionally
   `npm run build:demo` → `dist/demo/`. `vite.config.ts` already uses `base: './'`.
4. Keep the code, UI and documentation in English.
5. Ideas raised earlier, not started: verify balances with **edgepillar/zenon-spv**
   instead of trusting a node; pay an x402 endpoint from a photo (owner's
   **edgepillar/zenon-x402-poc** maps x402 to signed account blocks); optional passphrase
   encryption of the secret (it's only 32 bytes); JPEG-robust embedding research (DCT + Reed–Solomon),
   since the payload is ~30× smaller than a Cashu token.
6. Housekeeping: `.claude/skills/` and `skills-lock.json` are **inherited from Kakaonut**:
   third-party design/animation skills (emilkowalski/skills), unrelated to Zats; delete if unwanted.
   No og:image yet (Kakaonut's was removed).

## 9. Commands

```sh
npm ci
npm run dev            # copies pow files, starts Vite
npm test               # unit tests
npm run typecheck
npm run build          # dist/ (real site)
npm run build:demo     # dist-demo/ (pretend network)
npx vite preview --port 4317 &                       ; CHROME=/path/to/chrome npm run e2e
npx vite preview --outDir dist-demo --port 4318 &    ; CHROME=/path/to/chrome npm run e2e:demo
```

Node 22, npm 10. Dependencies are pinned exactly.

## 10. Map of the code

| Path | What it does |
| --- | --- |
| `src/zenon.ts` | Secrets, node connection + failover, account state, claim state, sweep. The money layer. |
| `src/wallet.ts` | localStorage records: pending deposit, saved secrets (History). |
| `src/photoStore.ts` | IndexedDB copy of the chosen photo while a deposit is pending. |
| `src/stego.ts`, `src/png.ts`, `src/read.ts`, `src/sticker.ts` | Frame, PNG encode/decode, reader. From Kakaonut. |
| `src/worker.ts`, `src/workerClient.ts` | Embedding/reading off the main thread. |
| `src/demo.ts` | Pretend node for demo builds. |
| `src/scene/*`, `src/components/{Scene,SkyDock}.tsx` | The world and its controls. |
| `src/components/MakeFlow.tsx` | Make: photo, amount, deposit, embed, done, History. |
| `src/components/{RedeemFlow,ClaimCard,SweepForm}.tsx` | Open and claim. |
| `src/components/{Hero,HeroPhoto,Chat}.tsx` | Landing hero with the animated chat. |
| `src/screens/HowScreen.tsx` | How it works (Simple/Advanced). |
| `src/i18n/en.ts` | All UI strings. |
| `src/styles.css` | Kakaonut base + Zats theme layers at the end. |
| `e2e/flow.mjs`, `e2e/demo-flow.mjs`, `e2e/fake-node.js` | End-to-end tests. |
| `test/*.test.ts` | Vitest unit tests. |

## 11. Conventions

- Comments explain *why*; never log secrets; secrets are saved before they're shown.
- Test fixtures use public constants only (e.g. `'7f'.repeat(32)`, all-zero entropy); no real keys.
- Keep Kakaonut's MIT notice and attribution (`LICENSE`, footer link, README).
- UI copy: plain, short, "zats" lowercase as the unit; `zatsUnit()` handles "1 zat".

## 12. Session history (how we got here)

1. Owner shared magical.cash and asked how to adapt it to Zenon → analysis: Cashu bearer tokens vs
   Zenon; chose a single-use account key in the photo; compared with a Zenon-backed Cashu mint.
2. "Use zats instead of sats" → zats unit and fastest path; measured PoW; chose SDK + ephemeral key.
3. Owner gave the public-node list → nodes tested; Kakaonut forked; money layer, UI, tests built;
   live read-only mainnet checks; spam-token fix.
4. "Demo website" → owner chose a simulated demo now (not GitHub Pages yet) → demo mode, published
   as a Claude artifact.
5. Design → pixel-art world + frosted glass + sky controls; then pixel fonts + alien theme.
6. This handoff.

## 13. References

- Kakaonut: <https://github.com/swedishfrenchpress/kakaonut> (base commit `6986c8a`)
- magical.cash (Kakaonut-based, Cashu): <https://magical.cash>
- go-zenon: <https://github.com/zenon-network/go-zenon> (`vm/constants/plasma.go`, `vm/embedded/implementation/htlc.go`, `chain/account_pool.go`, `rpc/api/ledger.go`)
- znn-typescript-sdk 1.0.5: <https://www.npmjs.com/package/znn-typescript-sdk>
- Public nodes: <https://blog.zenon.info/public-nodes/>
- Design brief: <https://www.inspora.design/posts/pixel-art-farm>
