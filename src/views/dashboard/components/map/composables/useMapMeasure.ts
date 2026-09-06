import {
  formatArea,
  formatDistance,
  lineLength,
  polygonArea,
  wrapLongitude,
} from "../utils/geometry";
import type { GeoPoint } from "../utils/geometry";

export type DrawingMode = "point" | "polyline" | "polygon" | "distance" | "area";
export const isAreaMode = (mode: DrawingMode | null) => mode === "polygon" || mode === "area";

// 绘制和测量共用几何计算与单位规则，避免两套结果口径。
export function measureDrawing(mode: DrawingMode, points: readonly GeoPoint[]) {
  if (!points.length) return "";
  if (mode === "point")
    return `经度 ${wrapLongitude(points[0].lng).toFixed(6)}°，纬度 ${points[0].lat.toFixed(6)}°`;
  if (isAreaMode(mode)) return `面积 ${formatArea(polygonArea(points))}`;
  return `${mode === "distance" ? "总距离" : "总长度"} ${formatDistance(lineLength(points))}`;
}
