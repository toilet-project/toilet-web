"""Dissolve the pinned 2026-07 administrative-dong source into precise districts.

Usage: python scripts/build-precise-region-boundaries.py PATH_TO_SOURCE_GEOJSON
Requires Shapely 2. The source file SHA-256 is checked before any output is written.
"""

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

from shapely import set_precision
from shapely.geometry import mapping, shape
from shapely.ops import unary_union


SOURCE_SHA256 = "c01ef44a0eb00978662ba7a6240ccb1da287fb52abd85104a1758969d391132f"
ROOT = Path(__file__).resolve().parent.parent
SIMPLIFIED = ROOT / "data" / "regions" / "sgg.json"
OUTPUT = ROOT / "data" / "regions" / "sgg-precise.json"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source = Path(sys.argv[1])
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit("Unexpected source boundary checksum")

    raw = json.loads(source.read_text(encoding="utf-8"))
    simplified = json.loads(SIMPLIFIED.read_text(encoding="utf-8"))
    geometries = defaultdict(list)
    for feature in raw["features"]:
        geometries[feature["properties"]["sgg"]].append(shape(feature["geometry"]))

    expected = {feature["properties"]["sgg"] for feature in simplified["features"]}
    if set(geometries) != expected:
        raise SystemExit(f"District codes differ: missing={expected - set(geometries)}, extra={set(geometries) - expected}")

    features = []
    for feature in simplified["features"]:
        code = feature["properties"]["sgg"]
        # A six-decimal WGS84 grid preserves roughly decimetre detail while
        # avoiding the long floating-point tails in the projected source.
        dissolved = set_precision(unary_union(geometries[code]), 0.000001)
        if dissolved.is_empty or not dissolved.is_valid:
            raise SystemExit(f"Invalid precise geometry for {code}")
        features.append({
            "type": "Feature",
            "properties": feature["properties"],
            "geometry": mapping(dissolved),
        })
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(features)} precise districts to {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
