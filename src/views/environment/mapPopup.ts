import type { WeatherStation, WeatherObservation } from "./types";
import { weatherStatuses } from "./config";
import { weatherValue, windText, localTime } from "./model";
import { escapeHtml } from "../remote-sensing/model";
export function weatherPopup(s: WeatherStation, o?: WeatherObservation) {
  return [
    s.name,
    `MOCK 最新快照 · ${weatherStatuses[s.status].label}`,
    `温度：${weatherValue(o?.temperature, "°C")}`,
    `湿度：${weatherValue(o?.relativeHumidity, "%")}`,
    `风速：${weatherValue(o?.windSpeed, " m/s")}`,
    `风向（来向）：${windText(o?.windDirection)}`,
    `1h 降雨：${weatherValue(o?.precipitation1h, " mm")}`,
    `24h 降雨：${weatherValue(o?.precipitation24h, " mm")}`,
    `更新：${o ? localTime(o.observedAt) : "--"}`,
  ]
    .map(escapeHtml)
    .join("<br>");
}
