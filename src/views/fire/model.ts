import { fireLevelConfig, fireSourceConfig, fireTransitions } from "./config";
import type { FireEvent, FireInput, FireQuery, FireStatus, FireTimeline } from "./types";

export function fireInput(event?: FireInput): FireInput {
  return {
    title: event?.title ?? "",
    level: event?.level ?? "low",
    source: event?.source ?? "manual",
    location: event
      ? { ...event.location }
      : { longitude: undefined, latitude: undefined, address: "" },
    fireType: event?.fireType ?? "未判定",
    description: event?.description ?? "",
    detectedAt: event?.detectedAt ?? new Date().toISOString(),
    confidence: event?.confidence ?? null,
    sourceId: event?.sourceId ?? "",
    sourceName: event?.sourceName ?? "",
    assignedOrganization: event?.assignedOrganization ?? "",
    commander: event?.commander ?? "",
  };
}
export function validateFire(input: FireInput): string {
  if (!input.title.trim() || input.title.length > 120) return "标题必填，最多 120 字";
  if (!Object.hasOwn(fireLevelConfig, input.level)) return "火情等级无效";
  if (!Object.hasOwn(fireSourceConfig, input.source)) return "发现来源无效";
  const { longitude, latitude } = input.location;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180)
    return "经度必须在 -180 至 180 之间";
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 85.05112878
  )
    return "纬度必须在地图支持范围 ±85.051129° 内";
  if (!input.detectedAt || !Number.isFinite(Date.parse(input.detectedAt))) return "发现时间无效";
  if (Date.parse(input.detectedAt) > Date.now()) return "发现时间不能晚于当前时间";
  if (
    input.confidence !== null &&
    (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
  )
    return "置信度必须为 0–1 或空值";
  if (
    [
      input.description,
      input.location.address,
      input.fireType,
      input.sourceId,
      input.sourceName,
      input.assignedOrganization,
      input.commander,
    ].some((value) => typeof value !== "string" || value.length > 2000)
  )
    return "文本字段最多 2000 字";
  return "";
}
// 只接收可编辑字段；即使调用方传入 status/code/timeline，也不会绕过状态机。
export function normalizedInput(input: FireInput): FireInput & { location: FireEvent["location"] } {
  const error = validateFire(input);
  if (error) throw new Error(error);
  return {
    ...fireInput(input),
    title: input.title.trim(),
    location: {
      longitude: input.location.longitude!,
      latitude: input.location.latitude!,
      address: input.location.address.trim(),
    },
    detectedAt: new Date(input.detectedAt).toISOString(),
  };
}
export function createFireCodeGenerator() {
  const counters = new Map<string, number>();
  return (events: readonly FireEvent[], now: string) => {
    const day = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
    const prefix = `FIRE-${day}-`;
    const maximum = events.reduce(
      (max, event) =>
        event.code.startsWith(prefix)
          ? Math.max(max, Number(event.code.slice(prefix.length)) || 0)
          : max,
      counters.get(day) ?? 0
    );
    counters.set(day, maximum + 1);
    return `${prefix}${String(maximum + 1).padStart(3, "0")}`;
  };
}
export function transitionFire(
  event: FireEvent,
  to: FireStatus,
  record: Pick<FireTimeline, "id" | "operator" | "timestamp" | "remark">
): FireEvent {
  if (!fireTransitions[event.status].includes(to)) throw new Error("不允许的火情状态跳转");
  if (!record.operator.trim()) throw new Error("操作人不能为空");
  if (
    !Number.isFinite(Date.parse(record.timestamp)) ||
    Date.parse(record.timestamp) < Date.parse(event.updatedAt) ||
    Date.parse(record.timestamp) < Date.parse(event.detectedAt)
  )
    throw new Error("状态变更时间无效");
  const fields = {
    confirmed: "confirmedAt",
    controlled: "controlledAt",
    extinguished: "extinguishedAt",
    closed: "closedAt",
  } as const;
  const field = fields[to as keyof typeof fields];
  return {
    ...event,
    status: to,
    updatedAt: record.timestamp,
    ...(field ? { [field]: record.timestamp } : {}),
    timeline: [
      ...event.timeline,
      { ...record, fireEventId: event.id, fromStatus: event.status, toStatus: to },
    ],
  };
}
export function filterFireEvents(events: readonly FireEvent[], query: FireQuery) {
  const keyword = query.keyword.trim().toLocaleLowerCase();
  return events.filter(
    (event) =>
      (!keyword ||
        [event.code, event.title, event.location.address, event.commander].some((value) =>
          value.toLocaleLowerCase().includes(keyword)
        )) &&
      (!query.status || event.status === query.status) &&
      (!query.level || event.level === query.level) &&
      (!query.source || event.source === query.source) &&
      (!query.from || Date.parse(event.detectedAt) >= Date.parse(query.from)) &&
      (!query.to || Date.parse(event.detectedAt) <= Date.parse(query.to))
  );
}
