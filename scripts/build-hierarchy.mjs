import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";
import { merge } from "topojson-client";
import { geoArea } from "d3";
import { PROVINCES } from "../src/geography.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/regions.geojson")),
);
const topo = topology({ regions: source });
const groups = new Map();
for (const geometry of topo.objects.regions.geometries) {
  const p = geometry.properties,
    province = p.code.slice(0, 2);
  const city =
    Number(province) >= 31 ? p.name.match(/^(.+?시).+구$/)?.[1] : null;
  const code = city ? p.code.slice(0, 4) + "0" : p.code;
  if (!groups.has(code))
    groups.set(code, { code, name: city || p.name, province, geometries: [] });
  groups.get(code).geometries.push(geometry);
}
function feature(properties, geometries) {
  const geometry = merge(topo, geometries);
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons)
    if (geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI)
      rings.forEach((r) => r.reverse());
  return { type: "Feature", properties, geometry };
}
const municipalities = [...groups.values()].map((g) =>
  feature(
    {
      code: g.code,
      name: g.name,
      province: g.province,
      level: "municipality",
      members: g.geometries.map((g) => g.properties.code),
    },
    g.geometries,
  ),
);
const provinces = Object.entries(PROVINCES).map(([code, name]) => {
  const geometries = topo.objects.regions.geometries.filter((g) =>
    g.properties.code.startsWith(code),
  );
  return feature(
    {
      code,
      name,
      province: code,
      level: "province",
      members: [
        ...new Set([
          ...geometries.map((g) => g.properties.code),
          ...municipalities
            .filter((f) => f.properties.province === code)
            .map((f) => f.properties.code),
        ]),
      ],
    },
    geometries,
  );
});
fs.writeFileSync(
  path.join(root, "public/data/hierarchy.geojson"),
  JSON.stringify({
    type: "FeatureCollection",
    features: [...provinces, ...municipalities],
  }),
);
console.log(
  `Built ${provinces.length} actual provincial boundaries and ${municipalities.length} terminal city/county/district boundaries.`,
);
