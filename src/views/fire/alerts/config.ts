import { fireSourceConfig, fireLevelConfig } from "../config";
import type { AlertStatus, AlertType, FireAlert } from "./types";
interface SymbolConfig {
  label: string;
  icon: string;
  color: string;
  sort: number;
}
export const alertSourceConfig = fireSourceConfig;
export const alertLevelConfig = fireLevelConfig;
export const alertTypeConfig: Record<AlertType, SymbolConfig> = {
  smoke: { label: "疑似烟雾", icon: "烟", color: "#64748b", sort: 0 },
  fire: { label: "疑似明火", icon: "火", color: "#dc2626", sort: 1 },
  thermal_anomaly: { label: "热异常", icon: "热", color: "#c2410c", sort: 2 },
  satellite_hotspot: { label: "卫星热点", icon: "星", color: "#0369a1", sort: 3 },
  manual_report: { label: "人工报告", icon: "报", color: "#15803d", sort: 4 },
  other: { label: "其他信号", icon: "其", color: "#475569", sort: 5 },
};
export const alertStatusConfig: Record<AlertStatus, SymbolConfig> = {
  new: { label: "新告警", icon: "!", color: "#b45309", sort: 0 },
  reviewing: { label: "研判中", icon: "?", color: "#0369a1", sort: 1 },
  confirmed: { label: "已确认", icon: "✓", color: "#b91c1c", sort: 2 },
  rejected: { label: "已驳回", icon: "×", color: "#64748b", sort: 3 },
  duplicate: { label: "重复信号", icon: "=", color: "#78716c", sort: 4 },
};
export const alertTransitions: Readonly<Record<AlertStatus, readonly AlertStatus[]>> = {
  new: ["reviewing"],
  reviewing: ["confirmed", "rejected", "duplicate"],
  confirmed: [],
  rejected: [],
  duplicate: [],
};
export const alertConfidence = (value: number | null) =>
  value === null ? "--" : `${(value * 100).toFixed(1)}%`;
export const pendingAlertStatuses: readonly AlertStatus[] = ["new", "reviewing"];
export const dashboardAlertLimit = 5;
export function alertSymbolHtml(alert: FireAlert) {
  const state = alertStatusConfig[alert.status];
  return `<span style="display:grid;place-items:center;width:32px;height:32px;border:3px dashed ${alertLevelConfig[alert.level].color};border-radius:50%;background:${state.color};color:white;font:bold 13px sans-serif;box-shadow:0 1px 4px #0005">${state.icon}${alertTypeConfig[alert.type].icon}</span>`;
}
