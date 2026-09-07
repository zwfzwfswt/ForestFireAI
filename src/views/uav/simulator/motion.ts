import type { Uav } from "../types";
import type { UavTelemetry } from "./types";
import { simulatorConfig as config } from "./config";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const radians = Math.PI / 180;
export function canSimulate(uav: Uav) {
  const b = config.simulationBounds;
  return (
    ["online", "mission", "warning"].includes(uav.status) &&
    uav.position.longitude >= b.west &&
    uav.position.longitude <= b.east &&
    uav.position.latitude >= b.south &&
    uav.position.latitude <= b.north
  );
}
export function seedTelemetry(uav: Uav, timestamp: number): UavTelemetry {
  return {
    uavId: uav.id,
    timestamp,
    ...uav.position,
    altitude: uav.position.altitude ?? 80,
    speed: clamp(uav.telemetry.speed ?? 5, 3, 12),
    heading: uav.telemetry.heading ?? 0,
    battery: uav.telemetry.battery ?? 100,
    signal: uav.telemetry.signal ?? 95,
    status: "online",
  };
}
export function moveTelemetry(previous: UavTelemetry, timestamp: number): UavTelemetry {
  const dt = clamp((timestamp - previous.timestamp) / 1000, 0, config.maxStepSeconds);
  const b = config.simulationBounds;
  const phase = [...previous.uavId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let turn = Math.sin(timestamp / 20000 + phase) * 1.5;
  if (
    previous.longitude < b.west + config.boundaryMargin ||
    previous.longitude > b.east - config.boundaryMargin ||
    previous.latitude < b.south + config.boundaryMargin ||
    previous.latitude > b.north - config.boundaryMargin
  ) {
    const target =
      Math.atan2(
        ((b.east + b.west) / 2 - previous.longitude) * Math.cos(previous.latitude * radians),
        (b.north + b.south) / 2 - previous.latitude
      ) / radians;
    turn = clamp(
      ((target - previous.heading + 540) % 360) - 180,
      -config.turnRate,
      config.turnRate
    );
  }
  let heading = (previous.heading + turn * dt + 360) % 360;
  const distance = previous.speed * dt;
  const latitude = previous.latitude + (distance * Math.cos(heading * radians)) / 111195;
  const longitude =
    previous.longitude +
    (distance * Math.sin(heading * radians)) / (111195 * Math.cos(previous.latitude * radians));
  if (longitude < b.west || longitude > b.east) heading = (360 - heading) % 360;
  if (latitude < b.south || latitude > b.north) heading = (180 - heading + 360) % 360;
  const battery = Math.max(0, previous.battery - config.batteryDrainRate * dt);
  return {
    ...previous,
    timestamp,
    heading,
    battery,
    longitude: clamp(longitude, b.west, b.east),
    latitude: clamp(latitude, b.south, b.north),
    altitude: clamp(previous.altitude + Math.sin(timestamp / 15000 + phase) * 0.2 * dt, 20, 200),
    signal:
      previous.signal === null
        ? null
        : clamp(previous.signal + Math.sin(timestamp / 10000 + phase) * 0.1 * dt, 0, 100),
    status: battery < 10 ? "warning" : "online",
  };
}
