# Architecture and decisions

Zats is a static application that hides the key to a single-use Zenon account in a PNG. The
sender funds that account from a wallet; the photo holder can receive its pending ZNN/QSR and
send the balance to another wallet. There is no custodial backend or account service.

The photo format and parts of the interface come from [Kakaonut](https://github.com/swedishfrenchpress/kakaonut)
(MIT). The Zenon money layer, procedural world and simulated demo are adaptations. Keep the
upstream notices in [LICENSE](../LICENSE), the README and the footer.

## Secrets and pixels

`src/zenon.ts` uses `znn-typescript-sdk` 1.0.5. `newSecret()` creates 32 bytes of BIP39 entropy.
The payload is `zats1` followed by 64 lowercase hex characters: 69 ASCII bytes. Account index 0
provides the address; its 24 words can be used for recovery in a compatible Zenon wallet.

The frame is `"ZATS" | version 0x01 | u32 payload length | payload | CRC-32`. Up to three copies
are written to the low bits of R, G and B pixels in row order. The reader tries individual copies
and then a majority vote. CRC is an integrity check, not encryption or authentication.

PNG encoding and decoding use `fast-png`. The reader does not recover pixels through canvas,
where browser fingerprinting defenses could change their low bits. Re-encoding a photo as JPEG
or sending a compressed preview can destroy the payload. Anyone with an intact secret-bearing
PNG or its recovery words can control the account.

## Making a photo

`MakeFlow.tsx` selects an image, amount and output size. Amounts are whole zats:
1 ZNN = 100,000,000 zats. `src/amount.ts` accepts digits or complete comma/space thousands
grouping, including NFKC-normalized full-width digits. Decimal points, ambiguous grouping, signs,
exponents and excessive amounts are rejected without deleting or truncating characters into a
different value. An invalid amount disables the deposit action. The current limit is 1,000 ZNN.

The app attempts to record the secret in History before showing its deposit address. A pending
record and an IndexedDB copy of the selected image support recovery across reloads. Sources are
keyed by account, and the original single-slot pending format remains readable. The deposit
preview is restored while waiting. This depends
on available, retained browser storage. If saving fails, the warning and recovery material must
be handled before funding; clearing a profile can still lose its records. Keep an offline backup.

The deposit watcher polls every three seconds. Only a positive ZNN total triggers embedding;
QSR alone and unsolicited tokens do not fund a photo. The amount shown comes from the node's
reported balance and kept incoming transfers, rather than the originally requested amount.
Embedding runs in a worker. The exact PNG and its creation amount are stored per account in
IndexedDB before the matching pending deposit and source are cleared. A reload during embedding
can therefore resume from the deposit and original image. An aborted or failed PNG save leaves
that recovery data intact and shows a download warning. The PNG can be downloaded, copied or
shared as a file.

## Reading and claiming

`RedeemFlow.tsx` reads the PNG, validates its token through the money layer, and displays a node
summary. `claimStateOf()` distinguishes available holdings, unconfirmed activity, an empty unused
account and a used account without kept holdings. These are observations from a node, not proofs
of consensus or final settlement. `ClaimCard.tsx` offers a form only when its state permits it.

`sweep()` has one active operation per page. Before connecting, it parses the destination with
the SDK, compares the canonical address with the photo account, and rejects non-user address
types and the empty address. Prefix spelling alone is not used to identify contract addresses.

For a valid destination the flow is:

1. Read balances, kept unreceived transfers and unconfirmed activity. Stop if empty or busy.
2. Publish one receive block for each kept incoming transfer and wait for its hash to appear at
   the node's account frontier.
3. Wait for kept incoming transfers and unconfirmed activity to clear. Stop if the wait expires.
4. Read spendable balances again. Never return a successful result with no balance sent.
5. Send each kept token's balance, ZNN first, and observe each resulting frontier hash.

Application-level read batches and frontier polling have bounded waits. PoW search and the
SDK's combined send call are asynchronous operations; the polling budget is not a guarantee of
total claim duration.
Observing a frontier hash is not the same as a confirmed recipient receive.

If a publish was attempted but the result cannot be established, the app reports an unconfirmed
outcome. Funds may already have moved. Check the photo account and recipient wallet before
another attempt; the app does not automatically retry publication. A successful `SweepResult`
contains the canonical recipient, sent amounts and returned block hashes.

History polls while open on the visible Hide screen, schedules the next read five seconds after
the previous read finishes, and refreshes on focus, visibility and network restoration. A row
pauses its reads while its take-back operation is busy. Local wallet writes and storage events
from other tabs update the list without a reload.

Saved PNGs can be opened in a dialog without stopping a deposit, including after a claim or while
offline. The image's creation amount is separate from the account's current status. For legacy
records without a stored PNG, a funded secret can be embedded in a replacement image regardless
of the old `photo` flag. Previous versions did not keep completed PNGs; their lost original images
cannot be reconstructed from the secret alone. Deleting a History row also requests removal of
its stored image and source. This is local recovery material, not a server-synchronized archive;
browser storage can be cleared or evicted, so downloads and offline recovery backups still matter.

## Kept tokens and node connections

Only ZNN and QSR are counted and moved. Other tokens remain reachable through the recovery
words. Incoming transfers are inspected in at most ten pages of fifty entries, so this is a
bounded view rather than an unlimited scan through spam.

The default nodes are `node.atsocy.com`, `node.zenonhub.io` and `my.hc1node.com`, over WSS on
port 35998. Availability can change. `VITE_ZNN_NODES` overrides this list; keep the deployment's
`connect-src` allowlist in sync.

The SDK's client status is not used as a connection-health flag. The page caches one connection
and coalesces simultaneous initialization. Failed candidates are closed; a failed read rotates
the next attempt to another node. The SDK's automatic reconnect loop is disabled. A late error
can invalidate only its own connection, and background reads defer disconnection during a claim.

## Proof of work and deployment policy

`scripts/copy-pow.mjs` copies the SDK's `pow.js` and `pow.wasm` to `public/pow/`. The SDK loads
them relative to the build base URL. Mainnet uses the SDK's worker so PoW does not block the page.
Difficulty comes from the node; runtime varies by device and nonce search. Phone timing needs
separate measurement.

On Vercel, mainnet allows same-origin assets, blob workers and the configured WSS nodes. The
current PoW implementation generates JavaScript functions, so this policy includes
`'unsafe-eval'`. The separate demo policy excludes eval and external nodes. Both policies refuse
framing, objects, base elements and form navigation. See [deployment and header details](vercel.md).
These headers belong to the Vercel configuration; another static host needs its own policy.

## Demo isolation

`VITE_DEMO=1` builds an in-page pretend node with its own History, pending records, image store
and ledger namespace. It has no real funds and skips PoW. It still exercises the SDK's key,
address and signing paths. Controls replace external wallet funding and open made photos without
requiring a download. The banner identifies the demo; explorer links are omitted.

A path and storage namespace are not a security boundary. Never fund a demo address or import
real recovery material into the demo. A domain change also does not migrate browser History.
Reconcile existing funds and preserve recovery material before changing production origin.

## Design and code map

The sky and alien world are procedural canvas drawings in `src/scene/`. `SkyDock.tsx` controls
time, weather and reduced page visibility. The scene pauses while hidden and handles an initially
zero-sized viewport. Pixel fonts are packaged locally; the stylesheet layers the theme over the
inherited layout.

| Area | Files |
| --- | --- |
| Secret, connection and sweep | `src/zenon.ts` |
| Amount validation | `src/amount.ts` |
| Local recovery records | `src/wallet.ts`, `src/photoStore.ts` |
| Frame and image handling | `src/stego.ts`, `src/png.ts`, `src/read.ts`, `src/sticker.ts` |
| Image workers | `src/worker.ts`, `src/workerClient.ts` |
| Make and History UI | `src/components/MakeFlow.tsx` |
| Redeem and claim UI | `src/components/{RedeemFlow,ClaimCard,SweepForm}.tsx` |
| Demo and build mode | `src/demo.ts`, `src/config.ts` |
| UI language and styling | `src/i18n/`, `src/styles.css` |
| Static deployment | `vercel.json`, `scripts/assemble-pages.mjs`, `.github/workflows/pages.yml` |

## Verification and limits

Unit tests cover the format, reader, storage modes, amount parsing, address guards, connection
races and uncertain claim outcomes. Browser tests use the real SDK and reduced-difficulty PoW
against a fake node, plus the no-funds demo. The harness applies `vercel.json` headers at `/` and
`/zats/`, including worker execution, blocked eval in the demo, external fetches and framing.

Those tests publish no mainnet blocks. The [mainnet checklist](mainnet-test.md) is a procedure,
not a public status record. Real-fund approvals, exact revisions, addresses and settlement
receipts are retained privately for each run; deployment and simulated tests are not substitutes.

The account graph is public on Zenon. Secrets are unencrypted in the photo and browser History.
Node balances are trusted, per-page concurrency does not coordinate other devices, and a
frontier observation alone does not establish final recipient settlement. Chat transport and
mobile performance require separate checks.

Potential future work includes verifiable balance reads, optional passphrase encryption and
JPEG-tolerant embedding. These are ideas, not implemented guarantees.
