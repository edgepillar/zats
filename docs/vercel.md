# Vercel deployment and a stable mainnet origin

Deployment status: **NOT DEPLOYED**. Domain configuration status: **NOT CONFIGURED**.
These are preparation instructions, not evidence of a live site or mainnet execution.

Keep `edgepillar/zats` private. Use the project name `zats` under an account or team with the
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
2. Import only the private `edgepillar/zats` repository. Limit GitHub App access to this repository
   when the connection offers that choice. Set the Node.js version to 22.x and review the build
   settings above. Keep source and deployment logs restricted to the project account.
3. Deploy and retain the returned deployment ID, revision and URL. Do not guess that
   `zats.vercel.app` is available. Select a plan appropriate for the actual use; Hobby is for
   personal, non-commercial use. Paid plans or changes to billing require separate authorization.
4. Verify the root page, `/demo/`, both sets of assets and the mainnet proof-of-work files. Check
   that the demo banner appears only in the demo, and test final-origin node access read-only.
   Do not create a funded photo on a temporary preview domain.

## Recommended production domain

Use **`https://zats.edgepillar.com/`** as the proposed stable production origin, with the demo at
**`https://zats.edgepillar.com/demo/`**. These are proposed destinations, not deployed URLs.

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
created at a `vercel.app` address do not automatically appear at `zats.edgepillar.com`. Settle on
the final HTTPS origin before funding. A redirect does not migrate these records. Preserve the
original browser profile, PNG and recovery material if an origin is ever changed.

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
