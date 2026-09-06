import { onScopeDispose, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { UavTelemetry } from "../views/uav/simulator/types";
import { simulatorConfig } from "../views/uav/simulator/config";
import { uavStatuses } from "../views/uav/config";

export const useTelemetryStore = defineStore("uav-telemetry", () => {
  const latestTelemetryByUavId = shallowRef<Record<string, UavTelemetry>>({});
  const tracksByUavId = shallowRef<Record<string, [number, number][]>>({});
  const now = ref(Date.now());
  let clock: ReturnType<typeof setInterval> | undefined;
  function startClock() {
    now.value = Date.now();
    if (clock === undefined)
      clock = globalThis.setInterval(() => {
        now.value = Date.now();
      }, simulatorConfig.telemetryInterval);
  }
  function stopClock() {
    if (clock !== undefined) clearInterval(clock);
    clock = undefined;
  }
  onScopeDispose(stopClock);
  let assetIds = new Set<string>();
  function remove(id: string) {
    const latest = { ...latestTelemetryByUavId.value };
    const tracks = { ...tracksByUavId.value };
    delete latest[id];
    delete tracks[id];
    latestTelemetryByUavId.value = latest;
    tracksByUavId.value = tracks;
  }
  function setAssetIds(ids: string[]) {
    assetIds = new Set(ids);
    Object.keys(latestTelemetryByUavId.value).forEach((id) => {
      if (!assetIds.has(id)) remove(id);
    });
  }
  function updateTelemetry(packet: UavTelemetry, receivedAt = Date.now()) {
    if (
      !assetIds.has(packet.uavId) ||
      !Object.hasOwn(uavStatuses, packet.status) ||
      ![
        packet.timestamp,
        packet.longitude,
        packet.latitude,
        packet.altitude,
        packet.speed,
        packet.heading,
        packet.battery,
        packet.signal,
        receivedAt,
      ].every(Number.isFinite) ||
      packet.timestamp > receivedAt ||
      packet.timestamp < 0 ||
      packet.timestamp <= (latestTelemetryByUavId.value[packet.uavId]?.timestamp ?? -1) ||
      Math.abs(packet.longitude) > 180 ||
      Math.abs(packet.latitude) > 90 ||
      packet.speed < 0 ||
      packet.heading < 0 ||
      packet.heading >= 360 ||
      packet.battery < 0 ||
      packet.battery > 100 ||
      packet.signal < 0 ||
      packet.signal > 100
    )
      return false;
    now.value = receivedAt;
    latestTelemetryByUavId.value = {
      ...latestTelemetryByUavId.value,
      [packet.uavId]: { ...packet },
    };
    tracksByUavId.value = {
      ...tracksByUavId.value,
      [packet.uavId]: [
        ...(tracksByUavId.value[packet.uavId] ?? []),
        [packet.latitude, packet.longitude] as [number, number],
      ].slice(-simulatorConfig.maxTrackPoints),
    };
    return true;
  }
  const getLatestTelemetry = (id: string) => latestTelemetryByUavId.value[id];
  const isOffline = (id: string) => {
    const packet = getLatestTelemetry(id);
    return !!packet && now.value - packet.timestamp > simulatorConfig.offlineTimeout;
  };
  function reset() {
    latestTelemetryByUavId.value = {};
    tracksByUavId.value = {};
    now.value = Date.now();
  }
  return {
    latestTelemetryByUavId,
    tracksByUavId,
    now,
    startClock,
    stopClock,
    updateTelemetry,
    getLatestTelemetry,
    isOffline,
    setAssetIds,
    remove,
    reset,
  };
});
