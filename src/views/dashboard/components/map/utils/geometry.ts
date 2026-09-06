// WGS84 经纬度（度），球面近似；距离 m、面积 m²，不计算地形起伏。
export interface GeoPoint {
  lat: number;
  lng: number;
}
const RADIUS = 6371000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
export const wrapLongitude = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

export function distance(a: GeoPoint, b: GeoPoint) {
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 2 * RADIUS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function lineLength(points: readonly GeoPoint[]) {
  return points.reduce(
    (sum, point, index) => sum + (index ? distance(points[index - 1], point) : 0),
    0
  );
}

// 球面经纬度边界积分，适用于本地简单多边形；闭合边隐式补齐。
export function polygonArea(points: readonly GeoPoint[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum +=
      radians(wrapLongitude(b.lng - a.lng)) * (Math.sin(radians(a.lat)) + Math.sin(radians(b.lat)));
  }
  return (Math.abs(sum) * RADIUS ** 2) / 2;
}

// 使用与 Leaflet 一致的墨卡托平面检查边相交，拒绝自交、重叠和退化区域。
export function polygonError(points: readonly GeoPoint[]): string {
  if (points.length < 3) return "区域至少需要 3 个不同节点";
  const projected = points.map((point) => ({
    lng: point.lng,
    lat: Math.log(Math.tan(Math.PI / 4 + radians(point.lat) / 2)),
  }));
  if (Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng)) >= 180)
    return "请绘制经度跨度小于 180° 的区域";
  const cross = (a: GeoPoint, b: GeoPoint, c: GeoPoint) =>
    (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  const planarArea = projected.reduce(
    (sum, point, index) =>
      sum + cross(projected[0], point, projected[(index + 1) % projected.length]),
    0
  );
  if (Math.abs(planarArea) < 1e-14) return "区域节点共线或边界自交，请重新绘制";
  const on = (a: GeoPoint, b: GeoPoint, c: GeoPoint) =>
    c.lng >= Math.min(a.lng, b.lng) &&
    c.lng <= Math.max(a.lng, b.lng) &&
    c.lat >= Math.min(a.lat, b.lat) &&
    c.lat <= Math.max(a.lat, b.lat);
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i],
      b = projected[(i + 1) % projected.length];
    for (let j = i + 1; j < projected.length; j++) {
      if (j === i + 1 || (i === 0 && j === projected.length - 1)) continue;
      const c = projected[j],
        d = projected[(j + 1) % projected.length];
      const abC = cross(a, b, c),
        abD = cross(a, b, d);
      const cdA = cross(c, d, a),
        cdB = cross(c, d, b);
      if (
        (abC * abD < 0 && cdA * cdB < 0) ||
        (abC === 0 && on(a, b, c)) ||
        (abD === 0 && on(a, b, d)) ||
        (cdA === 0 && on(c, d, a)) ||
        (cdB === 0 && on(c, d, b))
      )
        return "区域边界不能自交或重叠，请取消后重新绘制";
    }
  }
  if (polygonArea(points) < 0.01) return "区域面积过小或节点共线";
  return "";
}

export const formatDistance = (meters: number) =>
  meters < 1000 ? `${meters.toFixed(2)} m` : `${(meters / 1000).toFixed(2)} km`;
export const formatArea = (squareMeters: number) =>
  squareMeters < 1000000
    ? `${squareMeters.toFixed(2)} m²`
    : `${(squareMeters / 1000000).toFixed(2)} km²`;
