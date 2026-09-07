import { factorKeys, factorLabels, riskThresholds, riskWeights, weatherConfig } from "./config";
import type { FireRiskFactors, FactorKey, WeatherObservation } from "./types";
export const localTime = (time: string) =>
  new Date(time).toLocaleString("zh-CN", { hour12: false });
export const weatherValue = (value: number | null | undefined, unit = "") =>
  value == null ? "--" : `${value.toFixed(1)}${unit}`;
const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const directionNames = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
export function windDirection(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const angle = ((value % 360) + 360) % 360,
    index = Math.floor((angle + 22.5) / 45) % 8;
  return { angle, code: directions[index], label: directionNames[index] };
}
export const windText = (value: number | null | undefined) => {
  const wind = windDirection(value);
  return wind ? `${wind.label} ${wind.code} ${wind.angle}°` : "--";
};
export function validateFactors(factors: FireRiskFactors) {
  for (const key of factorKeys) {
    const factor = factors[key];
    if (
      !factor ||
      typeof factor.score !== "number" ||
      !Number.isFinite(factor.score) ||
      factor.score < 0 ||
      factor.score > 100
    )
      throw new Error(`${factorLabels[key]}缺测或超出 0–100，保留上次评估`);
    if (!factor.source?.trim() || !Number.isFinite(Date.parse(factor.updatedAt)))
      throw new Error("因子来源或时间无效");
  }
}
export function validateWeights(weights: Readonly<Record<FactorKey, number>>) {
  if (
    Object.keys(weights).length !== factorKeys.length ||
    factorKeys.some((key) => !Number.isFinite(weights[key]) || weights[key] < 0) ||
    Math.abs(factorKeys.reduce((sum, key) => sum + weights[key], 0) - 1) > 1e-9
  )
    throw new Error("八项非负权重总和必须为 1");
}
export function riskLevel(score: number) {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("风险评分必须在 0–100");
  return riskThresholds.find((t) => score >= t.min)!.level;
}
export function assessRisk(factors: FireRiskFactors, weights = riskWeights) {
  validateFactors(factors);
  validateWeights(weights);
  const score =
    Math.round(factorKeys.reduce((sum, key) => sum + factors[key].score! * weights[key], 0) * 100) /
    100;
  return { score, level: riskLevel(score) };
}
export function rankedFactors(factors: FireRiskFactors, weights = riskWeights) {
  validateWeights(weights);
  return factorKeys
    .map((key) => ({
      key,
      label: factorLabels[key],
      ...factors[key],
      weight: weights[key],
      contribution: factors[key].score === null ? null : factors[key].score! * weights[key],
    }))
    .sort((a, b) => (b.contribution ?? -1) - (a.contribution ?? -1));
}
const contribution = (value: number | null, low: number, high: number, reverse = false) => {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error("气象值必须有限或为 null");
  const score = Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
  return reverse ? 100 - score : score;
};
export function factorsFromObservation(
  previous: FireRiskFactors,
  observation: WeatherObservation
): FireRiskFactors {
  const source = `Weather / ${observation.stationId} · MOCK`,
    updatedAt = observation.observedAt;
  const factor = (score: number | null) => ({ score, source, updatedAt });
  return {
    ...previous,
    temperature: factor(contribution(observation.temperature, ...weatherConfig.temperatureRange)),
    humidity: factor(contribution(observation.relativeHumidity, 0, 100, true)),
    wind: factor(contribution(observation.windSpeed, 0, weatherConfig.windMax)),
    precipitation: factor(
      contribution(observation.precipitation24h, 0, weatherConfig.rain24Max, true)
    ),
  };
}
export function validateObservation(o: WeatherObservation) {
  if (!o.stationId || !Number.isFinite(Date.parse(o.observedAt)))
    throw new Error("观测站点或时间无效");
  const ranges: Record<
    keyof Omit<WeatherObservation, "stationId" | "observedAt">,
    [number, number]
  > = {
    temperature: [-100, 70],
    relativeHumidity: [0, 100],
    windSpeed: [0, 150],
    windDirection: [0, 360],
    precipitation1h: [0, 2000],
    precipitation24h: [0, 5000],
    pressure: [100, 1200],
    soilMoisture: [0, 100],
    visibility: [0, 1000],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = o[key as keyof typeof ranges];
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    )
      throw new Error(`气象字段 ${key} 无效`);
  }
}
