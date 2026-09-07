import type { UavStatus } from "../types";

export interface UavTelemetry {
  uavId: string;
  /** UTC epoch milliseconds. */
  timestamp: number;
  longitude: number;
  latitude: number;
  altitude: number;
  speed: number;
  heading: number;
  battery: number;
  signal: number | null;
  status: UavStatus;
}
