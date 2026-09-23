# Region map data

`sido.json` and `sgg.json` are the simplified July 2026 atlas boundaries from
[mapcn-kr](https://github.com/DevMinGeonPark/mapcn-kr), pinned at commit
`06c7a3456dd82965bd29042130441515717519ab`. That dataset credits
`vuski/admdongkor`, SGIS and the Ministry of the Interior and Safety and is
distributed under CC BY 4.0. The atlas keeps these lightweight shapes for
pan/zoom performance. `sgg-precise.json` is dissolved from the same upstream
`ver20260701/HangJeongDong_ver20260701.geojson` without simplification,
with coordinates snapped to a six-decimal WGS84 grid (about 0.1 m). It is
used only by the server and passed one district at a time to the detailed
Naver map. To reproduce it, install Shapely 2, download the pinned upstream
source, then run `python scripts/build-precise-region-boundaries.py SOURCE`.
The generator verifies the source SHA-256 and all 256 district codes.
Attribution remains visible in the regional UI. Do not substitute the older
API district reference table: its codes differ after the 2026 changes.

`counts.json`, `toilet-district.json`, `toilet-district-codes.json` and
`toilet-boundary-overrides.json` are generated from the public,
user-visible toilet API by `node scripts/build-region-snapshot.mjs`. Each
visible toilet coordinate is assigned to a precise district polygon. The
small override file corrects client-side detail links where the simplified
atlas polygon would classify a facility differently. Coordinates outside
every current precise polygon are excluded and counted in `unassigned`.
The snapshot timestamp appears on the UI. Regenerate all four snapshot
files before each regional preview or release so counts, links and sitemap
paths reflect the latest public data. District markers are read from the live
API and clipped to the same precise boundary.

`toilet-district-codes.json` is the compact runtime projection used while
building large multilingual sitemap shards. It avoids repeating polygon
searches for thousands of entries and must stay in sync with
`toilet-district.json`.

`names.json` holds code-keyed foreign-language district labels. They remain
machine-translated until individually reviewed; missing translations fall
back to Korean. Region URLs use numeric codes and are stable across locales.
