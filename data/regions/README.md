# Region map data

`sido.json` and `sgg.json` are the July 2026 administrative boundaries from
[mapcn-kr](https://github.com/DevMinGeonPark/mapcn-kr), pinned at commit
`06c7a3456dd82965bd29042130441515717519ab`. That dataset credits
`vuski/admdongkor`, SGIS and the Ministry of the Interior and Safety and is
distributed under CC BY 4.0. We retain the source names and codes, and show
the attribution in the regional UI. Do not substitute the older API district
reference table for these boundaries: the codes differ after the 2026 changes.

`counts.json` and `toilet-district.json` are generated from the public,
user-visible toilet API by `node scripts/build-region-snapshot.mjs`. Each
visible toilet coordinate is assigned to one district polygon. Coordinates
outside every current polygon are excluded and counted in `unassigned`. The
snapshot timestamp appears on the UI. Regenerate the snapshot before each
regional preview or release so counts and sitemap paths reflect the latest
public data; the district toilet list itself is fetched from the live API.

The district names remain in the official Korean form across locales until a
reviewed district-name translation table is available. Interface controls and
province names are localized. Region URLs use numeric codes and are stable
across all supported languages.
