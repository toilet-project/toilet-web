# Hangul Point v1

Approved on 2026-09-27: the initial C / HANGUL POINT design, with two ㄷ forms, a lower circle and a point extending from the right form. These four SVGs are exact copies of the approved master exports, not the earlier `c-geup-glyph` concept.

- `symbol-green.svg`: standalone symbol beside the existing international GEUP / DDONG wordmark on large auth presentations.
- `lockup-ko.svg`: outlined Korean symbol + 급똥 lockup for large auth presentations.
- `app-icon-square.svg`: opaque square artwork, with platform masks applied externally.
- `favicon-micro.svg`: the approved small-size optical variant.

Run `pnpm brand:build` to regenerate versioned public assets, the legacy favicon/OG aliases and manifest icon entries. Sharp is pinned in the lockfile. No external fonts or remote image downloads are used by the generator. The current English text, Jua font and tracking stay in the existing component/CSS.

`public/brand/hangul-point-v1/provenance.json` records source hashes. Create a new asset version directory for future artwork revisions instead of changing an already published version in place.

Compact page headers keep their existing Korean or English text without a symbol. The map's functional restroom pictograms, provider logos, user photos, service names and archived policies are intentionally preserved.
