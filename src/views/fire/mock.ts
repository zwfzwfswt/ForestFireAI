import type { FireEvent, FireStatus, FireSource, FireLevel } from "./types";
import { createFireCodeGenerator, fireInput, normalizedInput, transitionFire } from "./model";
import { mapConfig } from "../dashboard/components/map/mapConfig";

// DEV / MOCK：虚构事件，无真实火灾、告警、设备或调度关联。将来由 API 适配层替换。
export function createMockFireEvents(): FireEvent[] {
  const statuses: FireStatus[] = [
    "suspected",
    "verifying",
    "confirmed",
    "responding",
    "controlled",
    "extinguished",
    "closed",
    "false_alarm",
    "suspected",
    "responding",
  ];
  const sources: FireSource[] = ["manual", "uav", "ai", "satellite", "ranger", "camera", "other"];
  const path: FireStatus[] = [
    "suspected",
    "verifying",
    "confirmed",
    "responding",
    "controlled",
    "extinguished",
    "closed",
  ];
  const events: FireEvent[] = [];
  const nextCode = createFireCodeGenerator();
  for (const [index, status] of statuses.entries()) {
    const now = new Date(Date.UTC(2026, 8, 6, index)).toISOString();
    let event: FireEvent = {
      ...normalizedInput({
        ...fireInput(),
        title: `示范林区火情 ${String(index + 1).padStart(2, "0")}`,
        level: (["low", "medium", "high", "critical"] as FireLevel[])[index % 4],
        source: sources[index % sources.length],
        location: {
          longitude: mapConfig.center[1] - 0.16 + (index % 5) * 0.08,
          latitude: mapConfig.center[0] - 0.08 + Math.floor(index / 5) * 0.17,
          address: `示范林区 ${index + 1} 号巡护片区（Mock）`,
        },
        detectedAt: now,
        description: "仅用于前端流程验证的虚构事件，不代表实际火灾。",
        sourceName: "Mock 演示来源",
        assignedOrganization: "示范林区管护站",
        commander: "Mock 值班员",
      }),
      id: `mock-fire-${index + 1}`,
      code: nextCode(events, now),
      status: "suspected",
      confirmedAt: null,
      controlledAt: null,
      extinguishedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      alertIds: [],
      timeline: [],
      actions: [],
    };
    const steps =
      status === "false_alarm" ? ["false_alarm" as const] : path.slice(1, path.indexOf(status) + 1);
    steps.forEach((to, step) => {
      event = transitionFire(event, to, {
        id: `${event.id}-timeline-${step}`,
        operator: "Mock 值班员",
        timestamp: new Date(Date.parse(now) + (step + 1) * 60000).toISOString(),
        remark: "演示状态记录",
      });
    });
    events.push(event);
  }
  return events;
}
