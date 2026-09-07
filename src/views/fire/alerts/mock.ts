import { mapConfig } from "../../dashboard/components/map/mapConfig";
import type { FireEvent, FireSource, FireLevel } from "../types";
import type { AlertType, FireAlert } from "./types";
import { createAlertCodeGenerator } from "./model";
// DEV / MOCK：仅前端虚构线索；示意图片不是 AI 检测结果。
export function createMockAlerts(events: readonly FireEvent[]): FireAlert[] {
  const alerts: FireAlert[] = [];
  const code = createAlertCodeGenerator();
  const types: AlertType[] = [
    "smoke",
    "fire",
    "thermal_anomaly",
    "satellite_hotspot",
    "manual_report",
    "other",
  ];
  const sources: FireSource[] = ["ai", "uav", "satellite", "ranger", "camera", "manual", "other"];
  for (let index = 0; index < 16; index++) {
    const timestamp = new Date(Date.UTC(2026, 8, 6, 12, index * 2)).toISOString();
    const source = sources[index % sources.length];
    const relatedEvent = index >= 10 && index < 15 ? events[index === 10 ? 2 : 3] : undefined;
    const status =
      index < 6
        ? "new"
        : index < 10
          ? "reviewing"
          : index < 13
            ? "confirmed"
            : index < 15
              ? "duplicate"
              : "rejected";
    alerts.push({
      id: `mock-alert-${index + 1}`,
      code: code(alerts, timestamp),
      title: `示范林区异常信号 ${String(index + 1).padStart(2, "0")}`,
      type: types[index % types.length],
      source,
      level: (["low", "medium", "high", "critical"] as FireLevel[])[index % 4],
      status,
      location: {
        longitude: relatedEvent
          ? relatedEvent.location.longitude + (index - 12) * 0.001
          : mapConfig.center[1] - 0.14 + (index % 4) * 0.085,
        latitude: relatedEvent
          ? relatedEvent.location.latitude + (index - 12) * 0.001
          : mapConfig.center[0] - 0.12 + Math.floor(index / 4) * 0.075,
        address: `示范林区告警巡护点 ${index + 1}（Mock）`,
      },
      detectedAt: timestamp,
      receivedAt: timestamp,
      confidence: ["manual", "ranger", "other"].includes(source)
        ? null
        : 0.763 + (index % 5) * 0.04,
      sourceId: `mock-source-${index + 1}`,
      sourceName: "Mock 线索来源",
      media: {
        imageUrl: index % 3 === 0 ? "/mock/alert-evidence.svg" : null,
        thumbnailUrl: index % 3 === 0 ? "/mock/alert-evidence.svg" : null,
        videoUrl: null,
      },
      description: "虚构疑似火灾信号，需人工研判；不代表真实检测或火灾。",
      reviewer: status === "new" ? null : "Mock 研判员",
      reviewedAt: ["new", "reviewing"].includes(status) ? null : timestamp,
      reviewRemark:
        status === "duplicate"
          ? "与同一事件的其他来源信号重复（Mock）"
          : status === "rejected"
            ? "云雾干扰样例"
            : "",
      fireEventId: index >= 10 && index < 13 ? (events[index === 10 ? 2 : 3]?.id ?? null) : null,
      duplicateOfFireEventId: status === "duplicate" ? (events[3]?.id ?? null) : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return alerts;
}
