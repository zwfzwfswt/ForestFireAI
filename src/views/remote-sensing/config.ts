import type { Legend, ProductType, RiskLevel, Satellite, ProductStatus } from "./types";
export const satelliteLabels: Record<Satellite, string> = {
  sentinel2: "Sentinel-2",
  landsat: "Landsat",
  modis: "MODIS",
  viirs: "VIIRS",
  other: "其他",
};
export const statusLabels: Record<ProductStatus, string> = {
  available: "可用",
  processing: "处理中",
  ready: "就绪",
  failed: "失败",
  archived: "已归档",
};
export const riskLevels: Record<RiskLevel, { label: string; color: string }> = {
  low: { label: "1 Low / 低", color: "#228b45" },
  moderate: { label: "2 Moderate / 中", color: "#b5b52d" },
  high: { label: "3 High / 高", color: "#f2a12b" },
  very_high: { label: "4 Very High / 很高", color: "#e85b25" },
  extreme: { label: "5 Extreme / 极高", color: "#b51f32" },
};
export { factorLabels } from "../environment/config";
const gradient = (label: string, low: string, high: string, colors: string[]): Legend => ({
  label,
  stops: colors.map((color, i) => ({
    color,
    label: i === 0 ? low : i === colors.length - 1 ? high : "中",
  })),
});
export const productConfig: Record<
  ProductType,
  { label: string; min: number; max: number; unit: string; legend: Legend }
> = {
  rgb: {
    label: "RGB",
    min: 0,
    max: 255,
    unit: "DN",
    legend: gradient("RGB 示意", "暗", "亮", ["#16382d", "#63804b", "#cbc296"]),
  },
  ndvi: {
    label: "NDVI",
    min: -1,
    max: 1,
    unit: "无量纲",
    legend: gradient("NDVI", "低 −1", "高 1", ["#af7145", "#d8d478", "#237a42"]),
  },
  ndmi: {
    label: "NDMI",
    min: -1,
    max: 1,
    unit: "无量纲",
    legend: gradient("NDMI", "低 −1", "高 1", ["#c4894b", "#bdd2b5", "#2368a4"]),
  },
  ndwi: {
    label: "NDWI",
    min: -1,
    max: 1,
    unit: "无量纲",
    legend: gradient("NDWI", "低 −1", "高 1", ["#b5ab71", "#83c5bd", "#225caa"]),
  },
  nbr: {
    label: "NBR",
    min: -1,
    max: 1,
    unit: "无量纲",
    legend: gradient("NBR", "低 −1", "高 1", ["#9c493b", "#d6cf97", "#3c8058"]),
  },
  nbr2: {
    label: "NBR2",
    min: -1,
    max: 1,
    unit: "无量纲",
    legend: gradient("NBR2", "低 −1", "高 1", ["#a4657c", "#d4cfa6", "#3f827b"]),
  },
  lst: {
    label: "LST",
    min: 15,
    max: 45,
    unit: "°C",
    legend: gradient("LST", "低温 15°C", "高温 45°C", ["#3277b5", "#f3c567", "#b72c38"]),
  },
  fire_risk: {
    label: "Fire Risk",
    min: 1,
    max: 5,
    unit: "等级",
    legend: { label: "火险等级", stops: Object.values(riskLevels) },
  },
};
export const hotspotStyle = { color: "#fd6b22", glyph: "●", size: 20 };
export const hotspotStatusLabels = { unreviewed: "待核查", alert_created: "已生成告警" };
export const optionalValue = (value: number | null, unit = "") =>
  value === null ? "--" : `${value.toFixed(1)}${unit}`;
export const confidenceText = (value: number | null) =>
  optionalValue(value === null ? null : value * 100, "%");
export const productLayerId = (type: ProductType) =>
  type === "fire_risk" ? "FireRiskLayer" : "RemoteSensingLayer";
