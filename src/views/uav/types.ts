export type UavStatus = "online" | "offline" | "mission" | "charging" | "maintenance" | "warning";
export interface UavPayload {
  camera: boolean;
  thermalCamera: boolean;
  rtk: boolean;
  speaker: boolean;
  aiBox: boolean;
}
export interface Uav {
  id: string;
  name: string;
  serialNumber: string;
  model: string;
  status: UavStatus;
  // WGS84 度；高度 m，相对起飞点。null 表示没有快照，不能用 0 冒充。
  position: { longitude: number; latitude: number; altitude: number | null };
  telemetry: {
    speed: number | null; // m/s
    heading: number | null; // 0–360°
    battery: number | null; // %
    signal: number | null; // %
  };
  payload: UavPayload;
  organization: string;
  lastOnlineAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface UavInput {
  name: string;
  serialNumber: string;
  model: string;
  status: UavStatus;
  organization: string;
  longitude: number | undefined;
  latitude: number | undefined;
  payload: UavPayload;
}
export interface UavQuery {
  keyword: string;
  status: UavStatus | "";
  model: string;
}
