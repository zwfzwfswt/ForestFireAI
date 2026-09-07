export type FireStatus =
  | "suspected"
  | "verifying"
  | "confirmed"
  | "responding"
  | "controlled"
  | "extinguished"
  | "closed"
  | "false_alarm";
export type FireLevel = "low" | "medium" | "high" | "critical";
export type FireSource = "manual" | "uav" | "ai" | "satellite" | "ranger" | "camera" | "other";
export type FireActionType =
  "verification" | "dispatch" | "observation" | "firefighting" | "warning" | "note";
export interface FireInput {
  title: string;
  level: FireLevel;
  source: FireSource;
  location: { longitude: number | undefined; latitude: number | undefined; address: string };
  fireType: string;
  description: string;
  detectedAt: string;
  /** 0–1；人工上报或未提供时为 null。 */
  confidence: number | null;
  sourceId: string;
  sourceName: string;
  assignedOrganization: string;
  commander: string;
}
export interface FireTimeline {
  id: string;
  fireEventId: string;
  fromStatus: FireStatus;
  toStatus: FireStatus;
  operator: string;
  timestamp: string;
  remark: string;
}
export interface FireAction {
  id: string;
  fireEventId: string;
  time: string;
  type: FireActionType;
  content: string;
  operator: string;
}
export interface FireEvent extends FireInput {
  id: string;
  code: string;
  status: FireStatus;
  location: { longitude: number; latitude: number; address: string };
  confirmedAt: string | null;
  controlledAt: string | null;
  extinguishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  alertIds: string[];
  timeline: FireTimeline[];
  actions: FireAction[];
}
export interface FireQuery {
  keyword: string;
  status: FireStatus | "";
  level: FireLevel | "";
  source: FireSource | "";
  from: string;
  to: string;
}
