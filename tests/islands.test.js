import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  geoContains,
  geoBounds,
  geoCentroid,
  geoDistance,
  geoStream,
  geoMercator,
} from "d3";
import { islandLandmarks } from "../src/islands.js";
const load = (name) => JSON.parse(fs.readFileSync("public/data/" + name));
const dokdo = load("dokdo.geojson"),
  hierarchy = load("hierarchy.geojson"),
  meta = load("sources.json").dokdo;
const county = hierarchy.features.find((f) => f.properties.code === "37430"),
  province = hierarchy.features.find(
    (f) => f.properties.level === "province" && f.properties.code === "37",
  );
test("actual east/west islet rings contain independently specified DMS reference points and belong to Ulleung/Gyeongbuk", () => {
  assert.equal(dokdo.features.length, 2);
  for (const [i, key] of ["east", "west"].entries()) {
    assert.ok(geoContains(dokdo.features[i], meta.reference_points[key]));
    assert.ok(geoContains(county, meta.reference_points[key]));
    assert.ok(geoContains(province, meta.reference_points[key]));
  }
  const bounds = geoBounds(dokdo);
  assert.ok(
    bounds[0][0] > 131.86 &&
      bounds[1][0] < 131.88 &&
      bounds[0][1] > 37.23 &&
      bounds[1][1] < 37.25,
  );
  assert.equal(hierarchy.features.length, 246);
});
test("Dokdo remains southeast of Ulleung at realistic distance, using a common unshifted projection", () => {
  const marks = islandLandmarks(hierarchy, dokdo),
    u = marks.find((p) => p.id === "ulleung").coordinates,
    d = marks.find((p) => p.id === "dokdo").coordinates;
  assert.ok(d[0] > u[0] && d[1] < u[1]);
  const distance = geoDistance(u, d) * 6371.0088;
  assert.ok(distance > 85 && distance < 100);
  const original = load("regions.geojson").features.find(
    (f) => f.properties.code === "37430",
  );
  const points = (feature) => {
    const result = [];
    geoStream(feature, {
      point(x, y) {
        result.push([x, y]);
      },
      lineStart() {},
      lineEnd() {},
      polygonStart() {},
      polygonEnd() {},
    });
    return result;
  };
  let shortest = Infinity;
  for (const a of points(original))
    for (const b of points(dokdo))
      shortest = Math.min(shortest, geoDistance(a, b) * 6371.0088);
  assert.ok(shortest > 85 && shortest < 90);
  const projection = geoMercator().fitExtent(
    [
      [105, 70],
      [795, 755],
    ],
    hierarchy,
  );
  assert.ok(projection(d)[0] > projection(u)[0]);
  assert.ok(projection(d)[1] > projection(u)[1]);
  assert.ok(projection(d)[0] <= 795);
});
