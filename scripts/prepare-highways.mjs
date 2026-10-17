// Input: pinned Natural Earth 1:10m roads GeoJSON (see public/data/sources.json).
// Usage: node scripts/prepare-highways.mjs /path/to/ne_10m_roads.geojson
import fs from "node:fs";
import { createHash } from "node:crypto";
import { geoContains } from "d3";
const bytes = fs.readFileSync(process.argv[2]);
if (
  createHash("sha256").update(bytes).digest("hex") !==
  "66a0c7b438e92fd124822cc5921cfa11042f48c294ade5e0f03f2c6640fd0248"
)
  throw Error("Unexpected source checksum");
const provinces = JSON.parse(
  fs.readFileSync("public/data/hierarchy.geojson"),
).features.filter((f) => f.properties.level === "province");
const features = JSON.parse(bytes)
  .features.filter((f) => {
    if (f.properties.expressway !== 1 || f.geometry.type !== "LineString")
      return false;
    const coords = f.geometry.coordinates;
    // Keep original surveyed line segments; never join rest-area points or relocate roads.
    return (
      coords.every(([x, y]) => x > 124 && x < 132 && y > 33 && y < 38.7) &&
      provinces.some((p) =>
        geoContains(p, coords[Math.floor(coords.length / 2)]),
      )
    );
  })
  .map((f) => ({
    type: "Feature",
    properties: { sourceId: f.properties.orig_fid, expressway: 1 },
    geometry: f.geometry,
  }));
if (features.length < 100) throw Error("Unexpected highway coverage");
fs.writeFileSync(
  "public/data/highways.geojson",
  JSON.stringify({ type: "FeatureCollection", features }),
);
console.log(`${features.length} actual expressway line segments extracted`);
