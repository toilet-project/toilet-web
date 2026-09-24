# Interactive map cache rollout

The district and facility pages remain server-rendered with their current URLs, canonical links, alternate languages, facility links, and sitemap behavior. This change targets only the interactive map's public marker reads.

## Current pressure

Each settled map movement sends floating-point viewport bounds to `/api/v1/toilets`. The API reads visible toilets, display groups, and every current translation. Nearby viewports do not share a cache key. The 2026-09-24 read-only probe sustained 9.3 requests/second for 60–90 seconds; a MySQL container sample was 136% CPU. The 15 requests/second stage hit a per-client-IP Nginx limit, so it did not establish a server capacity ceiling.

## Rollout

1. Introduce a fixed 0.05-degree grid for ordinary marker zooms 6–9, including the initial level 6. Fetch intersecting cells, deduplicate by toilet ID, and clip the merged result to the actual viewport. Preserve the current API for closer/broad/unsupported viewports, cache errors, and rollback. Cluster zooms initially keep their existing response so cluster counts stay exact.
2. Store each cell under a stable, deployment-independent R2 key. A cache miss reads the existing public API. One concurrent miss per cell owns the refresh lease; other requests use a valid cached copy or wait. Existing signed cache invalidation events dirty cells intersecting old and new coordinates. Incomplete location scopes advance a global map generation.
3. Reduce origin miss cost: query only map fields instead of full toilet entities, and omit translated addresses from marker responses. Bound the public cell endpoint to 0.05 degrees in each direction. Keep detailed addresses on the facility endpoint. Verify the actual production query plan before changing DB indexes.
4. Enable this behind a WEB release flag for preview, compare marker IDs/counts against the legacy API at representative Seoul, Daejeon, Busan, Jeju and boundary viewports, then run mixed warm/cold load from multiple client IPs while sampling mini-PC CPU, MySQL CPU, API latency, R2 operations, and cache hit ratio. Roll back by disabling the flag if any data mismatch or latency regression appears.

The cache stores at most one object per requested grid cell, under a key that does not include the WEB deployment version. Production reads remain disabled until the comparison and capacity gate pass. No existing SEO route or database table is removed. Do not deploy WEB without the user's final go-ahead.
