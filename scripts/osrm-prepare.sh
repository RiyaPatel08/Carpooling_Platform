#!/usr/bin/env bash
# Prepare a self-hosted OSRM dataset for the Ahmedabad–Gandhinagar corridor.
# Only needed to drop the external routing dependency — the API works against
# routing.openstreetmap.de out of the box. Run this, then:
#   docker compose --profile osrm up -d osrm
#   # and set OSRM_URL=http://localhost:5000 in .env
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/osrm-data"
mkdir -p "$DIR"
cd "$DIR"

OSRM_IMG=ghcr.io/project-osrm/osrm-backend

if [ ! -f gujarat.osm.pbf ]; then
  echo "==> Downloading Gujarat extract (~90 MB)"
  curl -L -o gujarat.osm.pbf https://download.geofabrik.de/asia/india/gujarat-latest.osm.pbf
fi

# Clip to the demo corridor so preprocessing takes ~2 min instead of ~20.
if [ ! -f region.osm.pbf ]; then
  if command -v osmium >/dev/null 2>&1; then
    echo "==> Clipping to Ahmedabad–Gandhinagar bbox"
    osmium extract -b 72.40,22.90,72.80,23.30 gujarat.osm.pbf -o region.osm.pbf
  else
    echo "==> osmium not found, using the full Gujarat extract"
    cp gujarat.osm.pbf region.osm.pbf
  fi
fi

echo "==> extract / partition / customize (MLD pipeline)"
docker run --rm -v "$DIR:/data" $OSRM_IMG osrm-extract -p /opt/car.lua /data/region.osm.pbf
docker run --rm -v "$DIR:/data" $OSRM_IMG osrm-partition /data/region.osrm
docker run --rm -v "$DIR:/data" $OSRM_IMG osrm-customize /data/region.osrm

cat <<'EOF'

Done. Start it with:
  docker compose --profile osrm up -d osrm

Verify:
  curl "http://localhost:5000/route/v1/driving/72.55,23.02;72.63,23.19?overview=full"

Then set OSRM_URL=http://localhost:5000 in .env
EOF
