// Keep an original surveyed coordinate and every original ID for old backups.
// Group only identical base names on the same route, never nearby unrelated stops.
export function mergeRestAreas(points) {
  const groups = new Map();
  for (const point of [...points].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  )) {
    const name = point.name.replace(/\s*\([^()]*\)\s*$/u, "").trim();
    const key = JSON.stringify([String(point.route), name]);
    if (!groups.has(key))
      groups.set(key, { ...point, name, members: [], points: [] });
    const group = groups.get(key);
    group.members.push(point.id);
    group.points.push({ ...point });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    direction: group.members.length > 1 ? "방향별 기록" : group.direction,
  }));
}

export function restDirections(group) {
  const priority = { 상행: 0, 하행: 1, 양방향: 2 };
  return [...group.points]
    .sort(
      (a, b) =>
        (priority[a.direction] ?? 3) - (priority[b.direction] ?? 3) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    )
    .map((point) => ({
      ...point,
      destination: point.name.match(/\(([^()]*)\)\s*$/u)?.[1] || "",
    }));
}
export function recordsForDirection(records, pointId) {
  return records.filter((record) => record.target === pointId);
}
