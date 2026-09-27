# Hangul Point web transition

The approved C / HANGUL POINT identity now appears in browser/home-screen icons, sharing cards and the larger login/recovery presentations. Map, region and policy headers retain their existing Jua `급똥` or `GEUP` / `DDONG` text without an added symbol, as requested to preserve their compact width. `BrandWordmark` defaults to this existing text; only large auth presentations explicitly enable the symbol. Those presentations use the approved outlined Korean lockup or the symbol beside the current English text and tracking for the other five locales.

Header layout and account actions retain their previous behavior. Provider logos, user photos, map restroom markers, names, domains and the archived policy are unchanged.

## Assets and cache

The four approved source SVGs live in `assets/brand/hangul-point-v1`. `pnpm brand:build` reproducibly exports `/brand/hangul-point-v1/`: Korean lockup, symbol, micro favicon, 180px Apple touch PNG, 192/512px PWA PNGs, a separate 512px maskable PNG and the 1730×909 language-neutral sharing card. The maskable icon's meaningful pixels fit within the central 80% circle.

The root metadata and all locale sharing metadata use versioned paths. The manifest URL has `?v=hangul-point-v1` while its name, start URL and display mode remain the same. Legacy `/favicon.svg` and `/og-image.png` aliases also contain the new artwork so old links do not revive the former logo. Source hashes are recorded in public provenance and verified against the approved master. Existing hashed Next.js CSS/JS caching and the voluntary update notice are unchanged; there is no service worker to purge.

Browser/OS installed icons and already sent social previews can retain prior copies until those products refresh them. Deployment verification must distinguish fresh asset/metadata responses from those external caches.

## Validation

- Brand component rendering covers all six locales: default headers keep the original text with no image, while explicit auth lockups use the approved artwork and preserve `GEUP` / `DDONG`.
- Asset checks validate approved SVG hashes, source/export equality, PNG dimensions and opacity, PWA mask safety, and actual social image metadata dimensions.
- Existing foundation/policy checks retain map marker equality and archived policy content.
- Lint (six pre-existing warnings), typecheck, all 419 Node tests and isolated production smoke with both indexability modes passed. Windows checkouts with automatic CRLF may first regenerate existing region atlas/outline assets using their checked-in scripts; those generated files must have no Git content diff.
- Local browser checks confirmed the final Korean desktop header and English 320px mobile header retain the original text with no symbol, new icon/manifest metadata is present, and the large English login symbol loads. The mobile page has no horizontal overflow. Screenshots are in the local ignored `.generated` directory; the final auth capture timed out, while the rendered DOM/image load was verified. Live map credentials and installed home-screen behavior require the deployed preview or a device.

## Release handoff

`Workers validation` produces separate Linux artifacts for `preview` and `production-candidate` from the reviewed SHA. It runs lint/typecheck/tests, Node production smoke for both indexability modes, OpenNext build and Wrangler dry-run. CI has no deployment credentials and never uploads the runtime.

After downloading the matching artifact, run `node scripts/verify-worker-release.mjs <directory> <target> <full-sha>`. A preview artifact has only `wrangler.jsonc` and is for `preview.geupddong.com`; a production candidate has only `wrangler.production.jsonc`. Never mix or rebuild those artifacts during manual deployment.

Production routing is separately maintained for `geupddong.com/*` and `www.geupddong.com/*`. Do not run a normal deploy with the route-empty candidate config: use the established version upload/deploy procedure while preserving current routes and bindings, then verify Worker version, `/version.json`, fresh branded asset/metadata responses, public pages and rollback availability. `docs/workers-production-routing.md` describes the route ownership. This PR does not deploy or change Worker configuration, secrets, bindings or cache data.
