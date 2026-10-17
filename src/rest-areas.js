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
    direction: group.members.length > 1 ? "상·하행 통합" : group.direction,
  }));
}
