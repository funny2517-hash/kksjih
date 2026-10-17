import { geoBounds, geoArea } from "d3";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateRecord,
  parseBackup,
  makeBackup,
  sortRecords,
} from "../src/records.js";
const targets = new Set(["region-11010", "rest-1"]);
const r = {
  id: "example",
  target: "region-11010",
  date: "2026-10-17",
  title: "둘의 여행",
  memo: "추억",
  photos: [],
};
test("backup round trip preserves Unicode, notes and photos", () => {
  const record = { ...r, photos: ["data:image/png;base64,AAAA"] };
  assert.deepEqual(
    parseBackup(JSON.parse(JSON.stringify(makeBackup([record]))), targets),
    [record],
  );
});
test("invalid backup versions, dates, unknown targets and duplicate IDs are rejected", () => {
  for (const invalid of [
    { ...r, date: "2026-02-30" },
    { ...r, target: "unknown" },
    { ...r, photos: ["javascript:alert(1)"] },
    { ...r, photos: ["data:image/svg+xml;base64,AAAA"] },
    { ...r, memo: "x".repeat(5001) },
  ])
    assert.throws(() => validateRecord(invalid, targets));
  assert.throws(() => parseBackup({ version: 2, records: [] }, targets));
  assert.throws(() => parseBackup(makeBackup([r, r]), targets));
});
test("multiple visits sorted newest first without modifying input", () => {
  const input = [r, { ...r, id: "new", date: "2026-12-01" }];
  assert.equal(sortRecords(input)[0].id, "new");
  assert.equal(input[0].id, "example");
});
test("bundled geographic data has real coordinates, unique stable identities and all 250 boundaries", () => {
  const geo = JSON.parse(fs.readFileSync("public/data/regions.geojson"));
  assert.equal(geo.features.length, 250);
  const bounds = geoBounds(geo);
  assert.ok(
    bounds[0][0] > 124 &&
      bounds[1][0] < 132 &&
      bounds[0][1] > 33 &&
      bounds[1][1] < 39,
  );
  assert.ok(geoArea(geo) > 0 && geoArea(geo) < 0.01);
  assert.equal(new Set(geo.features.map((f) => f.properties.code)).size, 250);
  assert.ok(geo.features.some((f) => f.properties.name === "종로구"));
  assert.ok(geo.features.some((f) => f.properties.name === "서귀포시"));
  for (const f of geo.features)
    assert.ok(["Polygon", "MultiPolygon"].includes(f.geometry.type));
  const rest = JSON.parse(fs.readFileSync("public/data/rest-areas.json"));
  assert.equal(rest.length, 210);
  assert.equal(new Set(rest.map((r) => r.id)).size, 210);
  for (const r of rest) {
    assert.ok(r.lat >= 33 && r.lat <= 39 && r.lng >= 124 && r.lng <= 132);
    assert.ok(r.name && r.direction && r.route);
  }
});

test("two-level hierarchy retains all real geometry and legacy targets without allowing province records", async () => {
  const { targetForFeature, recordTargets, recordsForTarget } = await import(
    "../src/geography.js"
  );
  const hierarchy = JSON.parse(
    fs.readFileSync("public/data/hierarchy.geojson"),
  );
  const places = hierarchy.features.map(targetForFeature),
    map = new Map(places.map((t) => [t.id, t]));
  assert.equal(places.filter((t) => t.level === "province").length, 17);
  assert.equal(places.filter((t) => t.level === "municipality").length, 229);
  const find = (province, name) =>
    places.find((t) => t.province === province && t.name === name);
  for (const [province, name] of [
    ["36", "무안군"],
    ["11", "광진구"],
    ["31", "평택시"],
    ["31", "수원시"],
  ])
    assert.equal(find(province, name).level, "municipality");
  assert.equal(
    places.filter((t) => t.province === "31" && t.name.startsWith("수원"))
      .length,
    1,
  );
  const ids = recordTargets(map);
  assert.ok(!ids.has("province-31"));
  assert.ok(ids.has("region-31011"));
  const old = { ...r, target: "region-31011" };
  assert.equal(recordsForTarget([old], find("31", "수원시")).length, 1);
  assert.equal(recordsForTarget([old], map.get("province-31")).length, 1);
  const grouped = { ...r, target: find("31", "수원시").id };
  assert.equal(recordsForTarget([grouped], map.get("province-31")).length, 1);
  assert.throws(() => validateRecord({ ...r, target: "province-31" }, ids));
  for (const f of hierarchy.features) {
    const bounds = geoBounds(f);
    assert.ok(bounds[0][0] > 124 && bounds[1][0] < 132);
    assert.ok(geoArea(f) < 0.01);
  }
});
