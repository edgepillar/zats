# KakaoTalk survival test (Phase 0)

Does a PNG with hidden bits survive a trip through KakaoTalk? Fill this in from the **Open** tab's
“Copy results” button. These results set the product's default size, the send instructions, and
whether the QR + P2PK fallback (spec section 7) is needed.

**Verdicts:** `intact` (copy 1 survived) · `repaired` (a backup copy or majority vote saved it) ·
`damaged` (header found, checksum failed) · `not found` (PNG with nothing hidden) · `erased` (re-encoded to
JPEG/WebP/HEIC: every hidden bit is gone).

## Setup

| | Sender | Receiver |
|---|---|---|
| Device | | |
| OS version | | |
| KakaoTalk version | | |
| Browser used for Kakaonut | | |
| Kakaonut URL / commit | | |

Date tested:

## 0. Calibration: does the phone itself keep the photo?

Make test photos on the phone, save one to Photos (or Files), then open it on the Open tab.

| Device | Saved how | Verdict |
|---|---|---|
| | Download → Files | |
| | Press and hold → Save to Photos | |

## 1. Main grid

Record the verdict and the received size (W×H, format) in each cell. Save **both** the thumbnail in the
chat and the full image after tapping it.

| Send method | 2048 | 1280 | 640 |
|---|---|---|---|
| Photo, normal quality (일반, default): thumbnail | | | |
| Photo, normal quality (일반, default): full image | | | |
| Photo, original quality (원본; ⋯ before sending): full image | | | |
| As a file (+ → 파일) | | | |
| Pasted into a chat on KakaoTalk desktop (Mac/Windows) | | | |
| Kakaonut “Share…” → KakaoTalk (share sheet) | | | |

Other sizes:

| Photo | Route | Verdict | Evidence |
|---|---|---|---|
| `kakaonut-1000-sats.png` (Make page, PNG 1317×1194, 780 KB, real test-mint token) | Mac KakaoTalk desktop → 나와의 채팅 → iPhone: opened the photo in the chat, saved it → AirDrop back to the Mac → Open | **intact** | Received file `IMG_6952.PNG` is byte-for-byte identical to the original (SHA-256 `57385a836c11725f…`): KakaoTalk delivered the PNG unchanged |

## 2. Receiver differences

| Receiver | Best method that stayed intact | Notes |
|---|---|---|
| iPhone | | |
| Android | | |

## 3. Copy image → paste (instead of save)

| Receiving device | Where pasted | Verdict |
|---|---|---|
| | Kakaonut Open → “Paste image” | |

## Raw results (pasted from Open → Copy results)

<!-- paste tables here -->

**Run 1** (send method and devices not recorded yet: fill in which way these travelled)

| File | Format | Pixels | File size | Result | Made at |
| --- | --- | --- | --- | --- | --- |
| test-photo-1346.png | PNG | 1132×1346 | 385 KB | intact | 1132×1346 |
| test-photo-1280 (1).png | PNG | 1076×1280 | 366 KB | intact | 1076×1280 |
| test-photo-640 (1).png | PNG | 538×640 | 109 KB | intact | 538×640 |

## Decision

- [ ] Normal photo sending survives → flow is just “send a photo”.
- [ ] Only original quality / file survives → site tells the sender what to tap; cashu.me explains “sent the wrong way”.
- [ ] Nothing survives → build the fallback layer (QR in the photo + P2PK lock).

Default size for Make:
