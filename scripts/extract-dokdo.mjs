import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea, geoContains } from "d3";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(process.argv[2]));
const parent = source.features.find((f) => f.properties.adm_cd === "3743011");
if (!parent || parent.geometry.type !== "MultiPolygon")
  throw Error("Missing original Ulleung-eup geometry");
const polygons = parent.geometry.coordinates.filter((poly) =>
  poly
    .flat()
    .every(
      ([lng, lat]) => lng > 131.8 && lng < 132 && lat > 37.2 && lat < 37.3,
    ),
);
if (polygons.length !== 2) throw Error("Expected exactly two Dokdo islets");
polygons.sort(
  (a, b) =>
    Math.max(...b[0].map((p) => p[0])) - Math.max(...a[0].map((p) => p[0])),
);
const references = [
  [131 + 52 / 60 + 10.4 / 3600, 37 + 14 / 60 + 26.8 / 3600],
  [131 + 51 / 60 + 54.6 / 3600, 37 + 14 / 60 + 30.6 / 3600],
];
const features = polygons.map((coordinates, i) => {
  if (geoArea({ type: "Polygon", coordinates }) > 2 * Math.PI)
    coordinates.forEach((r) => r.reverse());
  const f = {
    type: "Feature",
    properties: {
      id: i ? "dokdo-west" : "dokdo-east",
      name: i ? "서도" : "동도",
      parent_code: "37430",
      source_adm_cd: "3743011",
      year: 2018,
    },
    geometry: { type: "Polygon", coordinates },
  };
  if (!geoContains(f, references[i]))
    throw Error("Reference point not within actual islet");
  return f;
});
fs.writeFileSync(
  path.join(root, "public/data/dokdo.geojson"),
  JSON.stringify({ type: "FeatureCollection", features }),
);
console.log(
  "Extracted original east/west islet coastline rings without moving or simplifying coordinates.",
);
