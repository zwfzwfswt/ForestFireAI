import type { FactorKey, WeatherStatus } from "./types";
import type { RiskLevel } from "../remote-sensing/types";
export const weatherStatuses: Record<
  WeatherStatus,
  { label: string; color: string; glyph: string }
> = {
  online: { label: "在线", color: "#15803d", glyph: "气" },
  offline: { label: "离线", color: "#64748b", glyph: "离" },
  maintenance: { label: "维护", color: "#7c3aed", glyph: "修" },
  warning: { label: "告警", color: "#c2410c", glyph: "!" },
};
export const factorLabels: Record<FactorKey, string> = {
  vegetation: "植被干燥",
  moisture: "水分亏缺",
  temperature: "高温",
  humidity: "低湿度",
  wind: "强风",
  precipitation: "少降雨",
  terrain: "地形",
  history: "历史火情",
};
// 仅 MOCK / DEMO，不是行业标准。值越高，风险贡献越高，低湿度/少降雨贡献更大。
export const riskWeights: Readonly<Record<FactorKey, number>> = {
  vegetation: 0.15,
  moisture: 0.15,
  temperature: 0.1,
  humidity: 0.2,
  wind: 0.15,
  precipitation: 0.1,
  terrain: 0.05,
  history: 0.1,
};
export const factorKeys = Object.keys(riskWeights) as FactorKey[];
export const riskThresholds: readonly { min: number; level: RiskLevel }[] = [
  { min: 80, level: "extreme" },
  { min: 60, level: "very_high" },
  { min: 40, level: "high" },
  { min: 20, level: "moderate" },
  { min: 0, level: "low" },
];
export const weatherConfig = {
  forecastHours: 24,
  forecastStepHours: 3,
  temperatureRange: [0, 40] as const,
  windMax: 20,
  rain24Max: 20,
};
export const weatherUnits = {
  temperature: "°C",
  relativeHumidity: "%",
  windSpeed: "m/s",
  windDirection: "°",
  precipitation1h: "mm",
  precipitation24h: "mm",
  pressure: "hPa",
  soilMoisture: "%",
  visibility: "km",
};
