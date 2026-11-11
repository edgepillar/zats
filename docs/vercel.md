# Vercel deployment and a stable mainnet origin

Production origin: **https://zats.vercel.app/**. Demo: **https://zats.vercel.app/demo/**.
The initial production deployment was verified on **2026-11-11**. No custom domain is configured.
The initial deployment evidence below does not include a real-fund claim. Keep mainnet test
receipts private; deployment and simulated transfers do not qualify a real transaction.

## Initial deployment evidence

- Source: [`278c7ab2cee87d1863f55b27cdf6147b6f880fcd`](https://github.com/edgepillar/zats/commit/278c7ab2cee87d1863f55b27cdf6147b6f880fcd).
- [Hosted CI](https://github.com/edgepillar/zats/actions/runs/42958602676) passed unit tests, both
  builds, and simulated browser flows at `/` and `/zats/`.
- Vercel reported **Ready** for that source. Both production entry pages rendered, with the demo
  banner only at `/demo/`. `/demo` returned a 308 redirect to `/demo/`.
- Mainnet and demo PoW file HEAD requests returned 200 with the expected content types. These
  checks did not execute proof of work in a live mainnet claim.
- A 0.1 ZNN **simulated** make, embed, open and claim flow completed on the deployed demo.
- Final-origin mainnet node connectivity and real-fund transfers were not established by these
  checks. Funding and claiming still require the acceptance guide and separate approvals.

## Security headers

`vercel.json` sets `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a
Content-Security-Policy with `frame-ancestors 'none'`. The mainnet policy allows only the three
default public node origins for external connections. Update `connect-src` whenever changing
`VITE_ZNN_NODES`.

The current SDK's PoW code uses `new Function`. The mainnet policy permits `'unsafe-eval'` for
compatibility with that code and its blob worker; this is a security trade-off, not a claim of
complete XSS protection. The demo has a separate policy with no eval permission or external
node connections. Both permit same-origin assets and local blob handling.

Generated hashed files under `/assets/` and `/demo/assets/` are cached as immutable. The unhashed
PoW files are excluded from this rule so a future SDK update can replace them.

`npm run e2e:pages` applies these configured response headers in its local server. It runs the
real SDK with a fake node and real, reduced-difficulty proof of work, tests the isolated demo,
and checks blocked eval in the demo, external fetches and framing. These checks establish local
browser behavior; inspect the live response headers after deployment. They publish no mainnet
blocks and do not replace a separately approved real-fund test.

The initial deployment observations bind to the revision above. A later documentation commit or deployment
does not retag them as execution evidence for a different revision.

Choose source-repository visibility separately from hosting. Before making source public, review
its full history and Actions logs for credentials, recovery material and personal information.
Use the project name `zats` under an account or team with the
public `edgepillar` identity. Review the account/team slug before deployment: Vercel-generated
deployment URLs can include that slug. Do not use a personal name or private identifier there.
No wallet, mnemonic, photo secret or private node credential belongs in Vercel environment
variables. The app needs no server-side wallet or backend.

## Build

The tracked `vercel.json` selects Vite and defines:

| Setting | Value |
| --- | --- |
| Install command | `npm ci` |
| Build command | `npm test && npm run build:pages` |
| Output directory | `dist` |
| Node.js version in project settings | 22.x |
| Mainnet application | `/` |
| Simulated application | `/demo/` |

Trailing slashes are enabled so `/demo` redirects to `/demo/`; this keeps relative asset and
worker URLs inside the demo directory. The app uses hash routes and does not need a catch-all
rewrite to the mainnet `index.html`. A catch-all could incorrectly serve the mainnet app for a
demo route. The referrer policy is `no-referrer`.

CI exercises both the Pages `/zats/` mount and a Vercel-style `/` mount. These are local static
server simulations on the hosted runner; they do not qualify Vercel edge routing, final-origin
WebSocket connectivity or a real transaction.

## Deploy without moving funds

1. Confirm the exact `main` revision has passing CI. Verify the connected Vercel account/team and
   GitHub identity before creating or linking anything. Do not overwrite an existing project.
2. Import only the `edgepillar/zats` repository. Limit GitHub App access to this repository
   when the connection offers that choice. Set the Node.js version to 22.x and review the build
   settings above. Keep private operational records and Vercel deployment logs restricted to the
   project account.
3. Deploy and retain the returned deployment ID, revision and URL. Do not guess that
   `zats.vercel.app` is available. Select a plan appropriate for the actual use; Hobby is for
   personal, non-commercial use. Paid plans or changes to billing require separate authorization.
4. Verify the root page, `/demo/`, both sets of assets and the mainnet proof-of-work files. Check
   that the demo banner appears only in the demo, and test final-origin node access read-only.
   Do not create a funded photo on a temporary preview domain.

## Optional future custom domain

The current choice is to use Vercel for both hosting and the production hostname. Keep
**`https://zats.vercel.app/`** as the production origin for now; unique deployment URLs are previews.

If a custom domain is requested later, **`https://zats.edgepillar.com/`** and its `/demo/` route
are options. They are not configured or deployed destinations.

1. Add only `zats.edgepillar.com` to the verified Vercel project. If it is already assigned
   elsewhere, inspect that assignment and stop rather than forcing reassignment.
2. Read the exact CNAME target and any verification record supplied by Vercel. Do not infer the
   target from documentation examples or reuse another project's value.
3. Inspect the authoritative DNS records for this exact subdomain. Add the required record at the
   current DNS provider after reviewing any conflict. Preserve the apex site, `www`, mail records,
   nameservers and all unrelated records. A subdomain does not require moving the entire zone.
4. Wait for verified DNS and a valid HTTPS certificate, then verify `/` and `/demo/` on the final
   domain. Keep temporary deployment URLs for unfunded previews. Configure production-domain
   redirects only after the final domain is verified.

Browser localStorage and IndexedDB are scoped to an origin. History, pending deposits and photos
created at a `vercel.app` address do not automatically appear at `zats.edgepillar.com`. A redirect
does not migrate these records. Before changing origins, reconcile all pending deposits and
funded photos at the old origin; any recovery transfer needs fresh approval. Preserve the old
browser profile, original PNGs and recovery material. Do not clear them merely because the new
site is live.

## Mainnet remains a separate approval

After final-domain checks, follow the [0.1 ZNN acceptance guide](mainnet-test.md). Funding and
claiming/receiving are separate approval gates. A successful deployment, domain verification or
simulated test authorizes no real transfer. A custom domain also does not make the ledger private:
the sender, photo account and recipient remain publicly linked.

## References

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain)
- [Generated deployment URLs](https://vercel.com/docs/deployments/generated-urls)
- [Vercel fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines)
- [Browser origins](https://developer.mozilla.org/en-US/docs/Glossary/Origin)
- [CSP script execution](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- [Worker CSP behavior](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
