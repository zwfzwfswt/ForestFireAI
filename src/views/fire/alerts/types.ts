import type { FireLevel, FireSource } from "../types";
export type AlertType =
  "smoke" | "fire" | "thermal_anomaly" | "satellite_hotspot" | "manual_report" | "other";
export type AlertStatus = "new" | "reviewing" | "confirmed" | "rejected" | "duplicate";
export interface AlertInput {
  title: string;
  type: AlertType;
  source: FireSource;
  level: FireLevel;
  location: { longitude: number; latitude: number; address: string };
  detectedAt: string;
  confidence: number | null;
  sourceId: string;
  sourceName: string;
  media: { imageUrl: string | null; thumbnailUrl: string | null; videoUrl: string | null };
  description: string;
}
export interface FireAlert extends AlertInput {
  id: string;
  code: string;
  status: AlertStatus;
  receivedAt: string;
  reviewer: string | null;
  reviewedAt: string | null;
  reviewRemark: string;
  fireEventId: string | null;
  duplicateOfFireEventId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AlertQuery {
  keyword: string;
  type: AlertType | "";
  source: FireSource | "";
  status: AlertStatus | "";
  level: FireLevel | "";
  from: string;
  to: string;
}
