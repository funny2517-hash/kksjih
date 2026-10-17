import { geoArea, geoCentroid } from "d3";
export function islandLandmarks(hierarchy, dokdo) {
  const county = hierarchy.features.find(
    (f) =>
      f.properties.level === "municipality" && f.properties.code === "37430",
  );
  const polygons =
    county.geometry.type === "Polygon"
      ? [county.geometry.coordinates]
      : county.geometry.coordinates;
  const mainland = polygons
    .map((coordinates) => ({ type: "Polygon", coordinates }))
    .sort((a, b) => geoArea(b) - geoArea(a))[0];
  return [
    { id: "ulleung", name: "울릉도", coordinates: geoCentroid(mainland) },
    { id: "dokdo", name: "독도", coordinates: geoCentroid(dokdo) },
  ];
}
