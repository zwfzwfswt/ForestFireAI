import type { FireStatus, FireLevel, FireSource, FireActionType } from "./types";
interface SymbolConfig {
  label: string;
  color: string;
  icon: string;
  sort: number;
}
export const fireStatusConfig: Record<FireStatus, SymbolConfig> = {
  suspected: { label: "疑似火情", color: "#b45309", icon: "疑", sort: 0 },
  verifying: { label: "核实中", color: "#0369a1", icon: "核", sort: 1 },
  confirmed: { label: "已确认", color: "#dc2626", icon: "火", sort: 2 },
  responding: { label: "处置中", color: "#c2410c", icon: "处", sort: 3 },
  controlled: { label: "已控制", color: "#0f766e", icon: "控", sort: 4 },
  extinguished: { label: "已扑灭", color: "#15803d", icon: "灭", sort: 5 },
  closed: { label: "已关闭", color: "#64748b", icon: "结", sort: 6 },
  false_alarm: { label: "误报", color: "#78716c", icon: "误", sort: 7 },
};
export const fireLevelConfig: Record<FireLevel, SymbolConfig> = {
  low: { label: "低", color: "#15803d", icon: "Ⅰ", sort: 0 },
  medium: { label: "中", color: "#a16207", icon: "Ⅱ", sort: 1 },
  high: { label: "高", color: "#c2410c", icon: "Ⅲ", sort: 2 },
  critical: { label: "极高", color: "#b91c1c", icon: "Ⅳ", sort: 3 },
};
export const fireSourceConfig: Record<FireSource, SymbolConfig> = {
  manual: { label: "人工上报", color: "#475569", icon: "人", sort: 0 },
  uav: { label: "无人机", color: "#7c3aed", icon: "机", sort: 1 },
  ai: { label: "AI 检测样例", color: "#0369a1", icon: "AI", sort: 2 },
  satellite: { label: "卫星样例", color: "#0e7490", icon: "星", sort: 3 },
  ranger: { label: "护林员", color: "#15803d", icon: "林", sort: 4 },
  camera: { label: "监控样例", color: "#4338ca", icon: "监", sort: 5 },
  other: { label: "其他", color: "#64748b", icon: "其", sort: 6 },
};
export const fireActionConfig: Record<FireActionType, string> = {
  verification: "现场核实",
  dispatch: "调派记录",
  observation: "观察记录",
  firefighting: "扑救记录",
  warning: "预警记录",
  note: "备注",
};
export const fireTransitions: Readonly<Record<FireStatus, readonly FireStatus[]>> = {
  suspected: ["verifying", "false_alarm"],
  verifying: ["confirmed", "false_alarm"],
  confirmed: ["responding"],
  responding: ["controlled"],
  controlled: ["extinguished"],
  extinguished: ["closed"],
  closed: [],
  false_alarm: [],
};
export const fireTimeLabels = {
  detectedAt: "发现时间",
  confirmedAt: "确认时间",
  controlledAt: "控制时间",
  extinguishedAt: "扑灭时间",
  closedAt: "关闭时间",
  createdAt: "创建时间",
  updatedAt: "更新时间",
} as const;
export const fireTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
export function fireSymbolHtml(status: FireStatus, level: FireLevel) {
  const state = fireStatusConfig[status];
  const risk = fireLevelConfig[level];
  return `<span style="display:grid;place-items:center;width:30px;height:30px;border:3px solid ${risk.color};border-radius:6px;background:${state.color};color:white;font:bold 12px sans-serif;box-shadow:0 1px 4px #0005">${state.icon}${risk.icon}</span>`;
}
