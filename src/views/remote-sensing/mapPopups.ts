import type { FireRiskZone, SatelliteHotspot } from "./types";
import { confidenceText, optionalValue, riskLevels } from "./config";
import { rankedFactors, localTime, weatherValue } from "../environment/model";
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
    "MOCK / DEMO · 加权演示模型，非行业标准",
    `等级：${riskLevels[z.level].label}`,
    `综合评分：${z.score}/100`,
    `更新：${localTime(z.generatedAt)}`,
    ...(z.assessmentError ? [`评估异常：${z.assessmentError}`] : []),
    "主要因素（按加权贡献排名）：",
    ...rankedFactors(z.factors)
      .slice(0, 3)
      .map(
        (f) => `${f.label}：${weatherValue(f.score)}/100 · 贡献 ${weatherValue(f.contribution)} 分`
      ),
  ]
    .map(escapeHtml)
    .join("<br>");
}
