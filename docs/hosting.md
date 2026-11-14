# Static hosting

The production site is **https://zats.pics/**; the simulated demo is
**https://zats.pics/demo/**. Both are hosted by Vercel. The original
**https://zats.vercel.app/** address remains available without a redirect so existing History
can still be opened in its original browser profile. Records do not migrate between domains.
See the [Vercel deployment guide](vercel.md) for domain configuration and storage boundaries.

Vercel and GitHub Pages use the same combined `dist/` output. GitHub Pages publication remains
a separate, manually triggered option.

## GitHub Pages

A Pages deployment publishes the generated website publicly, regardless of repository visibility.
Private-repository Pages also requires
an eligible GitHub plan. See [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
and [publishing-source visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Build and verification

Use Node.js 22 and npm 10. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm test
npm run build:pages
```

The combined artifact contains:

| Path within the Pages site | Build | Network |
| --- | --- | --- |
| `/` | Mainnet application | Public Zenon nodes |
| `/demo/` | Simulated application | An in-page pretend node |

For this project the default URLs would be `https://edgepillar.github.io/zats/` and
`https://edgepillar.github.io/zats/demo/`. These are intended destinations, not evidence of a
successful deployment. Vite uses relative asset paths, including for the proof-of-work worker.
The demo has separate History, pending-deposit and IndexedDB photo records. Existing mainnet
storage names remain unchanged. A URL path and a storage namespace are not a security boundary:
do not import a funded photo or real recovery words into the demo.

`npm run e2e:pages` serves the combined output at `/zats/` and checks the mainnet build against
a fake node with real proof of work, then the demo under a restrictive CSP with and without
localStorage. It requires Chrome; set `CHROME` to its executable. All transfers in these tests are
simulated. They do not establish mainnet qualification.

## Publication

1. Obtain explicit confirmation that the website may be publicly accessible. Source-repository
   visibility is a separate maintainer decision; it does not enable Pages publication.
2. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source. If the
   account plan refuses private-repository Pages, stop and report that limitation.
3. Open **Actions → Test and deploy Pages → Run workflow**, select `main`, and set `publish` to
   `true`. Pushes and pull requests only test and build; they never publish the website.
4. Wait for the build, browser tests and deployment jobs to pass for that exact commit. Use the
   URL reported by the deployment job. Check both the main site and `/demo/`, their assets, and
   the main site's node connectivity from the final origin.
5. Only then follow the [0.1 ZNN mainnet test guide](mainnet-test.md), with separate approval for
   each real-fund stage. Deployment does not approve a payment or a claim.

The workflow uses pinned official actions and an OpenID Connect deployment token. It uploads only
`dist/`; source handoffs, browser storage, photos made during testing and local receipts are not
part of the Pages artifact. See [GitHub's custom-workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
