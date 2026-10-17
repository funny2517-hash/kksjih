export const FORMAT = "our-korea-map";
export const MAX_PHOTOS = 6;
export const photoPattern =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
export function validateRecord(r, targets) {
  if (
    !r ||
    typeof r !== "object" ||
    typeof r.id !== "string" ||
    r.id.length > 100 ||
    !r.id ||
    !targets.has(r.target)
  )
    throw new Error("알 수 없는 기록 또는 지역입니다.");
  if (
    typeof r.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
    !Number.isFinite(Date.parse(r.date)) ||
    new Date(r.date).toISOString().slice(0, 10) !== r.date
  )
    throw new Error("방문 날짜가 올바르지 않습니다.");
  if (
    typeof r.memo !== "string" ||
    r.memo.length > 5000 ||
    typeof r.title !== "string" ||
    r.title.length > 100
  )
    throw new Error("제목 또는 메모 길이를 확인해 주세요.");
  if (
    !Array.isArray(r.photos) ||
    r.photos.length > MAX_PHOTOS ||
    !r.photos.every(
      (p) =>
        typeof p === "string" && p.length < 8000000 && photoPattern.test(p),
    )
  )
    throw new Error("사진 데이터가 올바르지 않습니다.");
  return {
    id: r.id,
    target: r.target,
    date: r.date,
    title: r.title,
    memo: r.memo,
    photos: [...r.photos],
  };
}
export function parseBackup(value, targets) {
  if (
    !value ||
    value.format !== FORMAT ||
    value.version !== 1 ||
    !Array.isArray(value.records) ||
    value.records.length > 20000
  )
    throw new Error("지원하지 않는 백업 파일입니다.");
  const records = value.records.map((r) => validateRecord(r, targets));
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw new Error("백업에 중복된 기록 ID가 있습니다.");
  return records;
}
export function makeBackup(records) {
  return {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
  };
}
export function sortRecords(records) {
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
}
