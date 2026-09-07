import { fireInput, normalizedInput } from "../model";
import { alertTransitions, alertTypeConfig } from "./config";
import type { AlertInput, AlertQuery, AlertStatus, FireAlert } from "./types";
export function normalizedAlert(input: AlertInput): AlertInput {
  const common = normalizedInput({ ...fireInput(), ...input });
  if (!Object.hasOwn(alertTypeConfig, input.type)) throw new Error("告警类型无效");
  for (const key of ["imageUrl", "thumbnailUrl", "videoUrl"] as const) {
    const url = input.media?.[key];
    // V1 只显示本地样例或 HTTPS 图片；不自动播放视频，不接受可执行 URL。
    if (url !== null && (typeof url !== "string" || !/^\/(?!\/)[\w/.-]+$|^https:\/\//i.test(url)))
      throw new Error("媒体地址无效");
  }
  return {
    title: common.title,
    type: input.type,
    source: common.source,
    level: common.level,
    location: common.location,
    detectedAt: common.detectedAt,
    confidence: common.confidence,
    sourceId: common.sourceId,
    sourceName: common.sourceName,
    description: common.description,
    media: {
      imageUrl: input.media.imageUrl,
      thumbnailUrl: input.media.thumbnailUrl,
      videoUrl: input.media.videoUrl,
    },
  };
}
export function transitionAlert(
  alert: FireAlert,
  to: AlertStatus,
  remark: string,
  timestamp: string
): FireAlert {
  if (!alertTransitions[alert.status].includes(to)) throw new Error("不允许的告警状态转换");
  if (remark.length > 2000 || (["rejected", "duplicate"].includes(to) && !remark.trim()))
    throw new Error("驳回或重复必须填写理由，最多 2000 字");
  return {
    ...alert,
    status: to,
    reviewer: "Mock 研判员",
    reviewedAt: to === "reviewing" ? null : timestamp,
    reviewRemark: remark.trim(),
    updatedAt: timestamp,
  };
}
export function createAlertCodeGenerator() {
  const counters = new Map<string, number>();
  return (alerts: readonly FireAlert[], now: string) => {
    const prefix = `ALERT-${new Date(now).toISOString().slice(0, 10).replaceAll("-", "")}-`;
    const next =
      alerts.reduce(
        (max, alert) =>
          alert.code.startsWith(prefix)
            ? Math.max(max, Number(alert.code.slice(prefix.length)) || 0)
            : max,
        counters.get(prefix) ?? 0
      ) + 1;
    counters.set(prefix, next);
    return `${prefix}${String(next).padStart(3, "0")}`;
  };
}
export function filterAlerts(alerts: readonly FireAlert[], query: AlertQuery) {
  const keyword = query.keyword.trim().toLocaleLowerCase();
  return alerts.filter(
    (alert) =>
      (!keyword ||
        [alert.code, alert.title, alert.sourceName, alert.location.address].some((value) =>
          value.toLocaleLowerCase().includes(keyword)
        )) &&
      (!query.type || alert.type === query.type) &&
      (!query.source || alert.source === query.source) &&
      (!query.status || alert.status === query.status) &&
      (!query.level || alert.level === query.level) &&
      (!query.from || Date.parse(alert.detectedAt) >= Date.parse(query.from)) &&
      (!query.to || Date.parse(alert.detectedAt) <= Date.parse(query.to))
  );
}
