import type { UavPayload, UavStatus } from "./types";

// 列表、详情、地图共享文字/颜色/符号，状态均为人工编辑的 Mock 状态。
export const uavStatuses: Record<UavStatus, { label: string; color: string; glyph: string }> = {
  online: { label: "在线", color: "#15803d", glyph: "●" },
  offline: { label: "离线", color: "#64748b", glyph: "○" },
  mission: { label: "执行任务", color: "#2563eb", glyph: "▶" },
  charging: { label: "充电", color: "#a16207", glyph: "ϟ" },
  maintenance: { label: "维护", color: "#7c3aed", glyph: "⚒" },
  warning: { label: "告警", color: "#dc2626", glyph: "!" },
};
export const payloadLabels: Record<keyof UavPayload, string> = {
  camera: "可见光相机",
  thermalCamera: "热红外相机",
  rtk: "RTK 定位",
  speaker: "喊话器",
  aiBox: "AI 盒子",
};
export const emptyPayload = (): UavPayload => ({
  camera: false,
  thermalCamera: false,
  rtk: false,
  speaker: false,
  aiBox: false,
});
export const snapshotValue = (value: number | null, unit: string) =>
  value === null ? "暂无快照" : `${Number(value.toFixed(2))} ${unit}`;
export const formatUavTime = (value: string | null) =>
  value ? `${value.replace("T", " ").replace(/\.\d{3}Z$|Z$/, "")} UTC` : "暂无记录";
