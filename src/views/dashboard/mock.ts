export interface DashboardStat {
  label: string;
  value: number;
  unit: string;
  note: string;
}
export interface DashboardAlert {
  id: string;
  time: string;
  type: string;
  source: string;
  confidence: number | null;
  status: "待复核" | "复核中" | "已排除";
  level: "高" | "中";
  area: string;
  description: string;
}
// 固定演示快照，不表示当前实时观测；所有数量均为本地样例。
export const dashboardSnapshot = "2026-09-06 14:32:00（UTC+8）";
export const dashboardAlerts: DashboardAlert[] = [
  {
    id: "AL-001",
    time: "2026-09-06 14:32:00",
    type: "疑似烟雾",
    source: "巡检无人机 UAV-03 · AI样例",
    confidence: 0.96,
    status: "待复核",
    level: "高",
    area: "示范林区 · 北部山脊",
    description: "样例图像出现疑似烟雾特征，需人工查看原始证据并核实。当前未接入影像或模型。",
  },
  {
    id: "AL-002",
    time: "2026-09-06 14:26:00",
    type: "疑似火点",
    source: "巡检无人机 UAV-01 · AI样例",
    confidence: 0.89,
    status: "复核中",
    level: "高",
    area: "示范林区 · 东侧缓冲带",
    description: "样例检测结果存在疑似火点，不代表已确认火灾；等待人工复核。",
  },
  {
    id: "AL-003",
    time: "2026-09-06 14:18:00",
    type: "人工烟情上报",
    source: "护林员 · 人工上报样例",
    confidence: null,
    status: "待复核",
    level: "中",
    area: "示范林区 · 南部巡护道",
    description: "人工上报样例无模型置信度，需核对位置、时间及现场情况。",
  },
  {
    id: "AL-004",
    time: "2026-09-06 13:50:00",
    type: "疑似烟雾",
    source: "固定监测点 CAM-02 · AI样例",
    confidence: 0.72,
    status: "已排除",
    level: "中",
    area: "示范林区 · 西侧瞭望点",
    description: "演示复核记录：判定为云雾干扰，已排除。本页面不提供真实状态变更操作。",
  },
];
export const dashboardStats: DashboardStat[] = [
  { label: "在线无人机", value: 8, unit: "架", note: "设备总数 12 架 · 模拟在线" },
  { label: "今日巡检任务", value: 16, unit: "项", note: "已完成 11 · 执行中 3 · 待执行 2" },
  {
    label: "疑似火情",
    value: dashboardAlerts.filter((item) => item.status !== "已排除").length,
    unit: "处",
    note: "待人工核实，不代表确认火灾",
  },
  {
    label: "AI告警",
    value: dashboardAlerts.filter((item) => item.confidence !== null).length,
    unit: "条",
    note: "本日样例累计 · 含已排除",
  },
  { label: "高风险区域", value: 2, unit: "处", note: "演示风险分区 · 非实际评估" },
];
