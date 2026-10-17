export const PROVINCES = {
  11: "서울특별시",
  21: "부산광역시",
  22: "대구광역시",
  23: "인천광역시",
  24: "광주광역시",
  25: "대전광역시",
  26: "울산광역시",
  29: "세종특별자치시",
  31: "경기도",
  32: "강원도",
  33: "충청북도",
  34: "충청남도",
  35: "전라북도",
  36: "전라남도",
  37: "경상북도",
  38: "경상남도",
  39: "제주특별자치도",
};
export function targetForFeature(feature) {
  const p = feature.properties;
  const id = (p.level === "province" ? "province-" : "region-") + p.code;
  feature.id = id;
  return {
    id,
    name: p.name,
    sub:
      p.level === "province" ? "시·도를 선택해 주세요" : PROVINCES[p.province],
    type: "region",
    level: p.level,
    province: p.province,
    feature,
    members: p.members.map((code) => "region-" + code),
  };
}
export function recordTargets(targets) {
  return new Set(
    [...targets.values()]
      .filter((t) => t.type === "rest" || t.level === "municipality")
      .flatMap((t) => [t.id, ...(t.members || [])]),
  );
}
export function recordsForTarget(records, target) {
  if (!target) return [];
  const ids = new Set([target.id, ...(target.members || [])]);
  return records.filter((r) => ids.has(r.target));
}
