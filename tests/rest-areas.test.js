import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeRestAreas } from "../src/rest-areas.js";
import { recordTargets, recordsForTarget } from "../src/geography.js";
const raw = JSON.parse(fs.readFileSync("public/data/rest-areas.json"));
test("up/down stops on the same route become one marker, with every legacy ID and real coordinate preserved", () => {
  const grouped = mergeRestAreas(raw);
  assert.equal(grouped.length, 128);
  const ids = grouped.flatMap((r) => r.members);
  assert.equal(ids.length, 210);
  assert.equal(new Set(ids).size, 210);
  for (const group of grouped)
    assert.ok(
      raw.some(
        (r) =>
          group.members.includes(r.id) &&
          r.lat === group.lat &&
          r.lng === group.lng,
      ),
    );
  const haman = grouped.find((r) => r.name === "함안");
  assert.deepEqual(haman.members, ["rest-4", "rest-5"]);
  assert.equal(haman.direction, "상·하행 통합");
  const records = [
    { id: "a", target: "rest-4" },
    { id: "b", target: "rest-5" },
  ];
  assert.equal(recordsForTarget(records, haman).length, 2);
  assert.equal(
    recordTargets(new Map(grouped.map((r) => [r.id, { ...r, type: "rest" }])))
      .size,
    210,
  );
});
test("same-name stops on different routes stay separate; regrouping is deterministic", () => {
  const points = [
    { id: "rest-2", name: "테스트(서울)", route: "10", lat: 35, lng: 127 },
    { id: "rest-1", name: "테스트(부산)", route: "10", lat: 35.1, lng: 127.1 },
    { id: "rest-3", name: "테스트(서울)", route: "20", lat: 36, lng: 128 },
  ];
  assert.equal(mergeRestAreas(points).length, 2);
  assert.deepEqual(
    mergeRestAreas(points),
    mergeRestAreas([...points].reverse()),
  );
});
