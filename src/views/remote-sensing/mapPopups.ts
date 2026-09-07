import type { FireRiskZone, SatelliteHotspot } from "./types";
import { confidenceText, optionalValue, riskLevels, factorLabels } from "./config";
import { escapeHtml } from "./model";
export function hotspotPopup(h: SatelliteHotspot) {
  return [
    "MOCK / DEMO 卫星热异常",
    h.id,
    `${h.satellite} / ${h.sensor}`,
    `置信度：${confidenceText(h.confidence)}`,
    `FRP：${optionalValue(h.frp, " MW")}`,
    `发现：${h.detectedAt}`,
    `关联告警：${h.alertId ?? "--"}`,
    `关联火情：${h.fireEventId ?? "--"}`,
  ]
    .map(escapeHtml)
    .join("<br>");
}
export function riskPopup(z: FireRiskZone) {
  return [
    z.name,
    "MOCK / DEMO · 风险因素未实际计算",
    `等级：${riskLevels[z.level].label}`,
    `分数：${z.score}/100`,
    `更新：${z.generatedAt}`,
    ...Object.entries(z.factors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, value]) => `${factorLabels[key as keyof FireRiskZone["factors"]]}：${value}/100`),
  ]
    .map(escapeHtml)
    .join("<br>");
}
