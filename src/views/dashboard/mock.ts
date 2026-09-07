export interface DashboardStat {
  label: string;
  value: number;
  unit: string;
  note: string;
}
// 固定统计快照不代表实时观测；告警数量由 Fire Alert Store 提供。
export const dashboardSnapshot = "2026-09-06 14:32:00（UTC+8）";
export const dashboardStats: DashboardStat[] = [
  { label: "在线无人机", value: 8, unit: "架", note: "设备总数 12 架 · 模拟在线" },
  { label: "今日巡检任务", value: 16, unit: "项", note: "已完成 11 · 执行中 3 · 待执行 2" },
  {
    label: "疑似火情",
    value: 0,
    unit: "处",
    note: "待人工核实，不代表确认火灾",
  },
  {
    label: "AI告警",
    value: 0,
    unit: "条",
    note: "会话内 AI 来源样例 · 含已处理",
  },
  { label: "高风险区域", value: 2, unit: "处", note: "演示风险分区 · 非实际评估" },
];
