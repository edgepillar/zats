# Upstream

This folder is a fork of [cashubtc/cashu.me](https://github.com/cashubtc/cashu.me), copied from
commit `002a0a367966ffda04bb29d1ca888fcbcd070e16` ("Merge pull request #615").
Licensed MIT (see LICENSE.md).

Kakaonut changes are marked with `Kakaonut:` comments and live mostly in:

- `src/js/kakaonut/`: hidden-data reader (identical copies of the site's `stego.ts` / `png.ts`) + config
- `src/components/PhotoClaimDialog.vue`: paste a photo → scan → reveal → claim
- `src/pages/WalletPage.vue`: skips onboarding, adds the default mint, photo entry points

To pull upstream changes, diff this folder against a fresh clone at a newer commit.
