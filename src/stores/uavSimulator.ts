import { onScopeDispose, shallowRef, watch } from "vue";
import { defineStore } from "pinia";
import { useUavStore } from "./uav";
import { useTelemetryStore } from "./telemetry";
import { createUavSimulator } from "../views/uav/simulator/runtime";
import type { SimulatorState } from "../views/uav/simulator/runtime";

export const useUavSimulatorStore = defineStore("uav-simulator", () => {
  const assets = useUavStore();
  const telemetry = useTelemetryStore();
  const state = shallowRef<SimulatorState>({
    mode: "stopped",
    pausedIds: [],
    eligibleIds: [],
    timerActive: false,
  });
  const owners = new Set<symbol>();
  const runtime = createUavSimulator({
    assets: () => assets.list,
    packet: (packet, now) => {
      telemetry.updateTelemetry(packet, now);
    },
    clock: (now) => {
      telemetry.now = now;
    },
    reset: telemetry.reset,
    remove: telemetry.remove,
    changed: (value) => {
      state.value = value;
    },
  });
  watch(() => assets.list, runtime.reconcile, { immediate: true, flush: "sync" });
  watch(() => assets.sessionVersion, runtime.reset, { flush: "sync" });
  onScopeDispose(() => {
    owners.clear();
    runtime.suspend();
  });
  function acquire(owner: symbol) {
    owners.add(owner);
    if (owners.size === 1) runtime.activate();
  }
  function release(owner: symbol) {
    owners.delete(owner);
    if (!owners.size) runtime.suspend();
  }
  return {
    state,
    acquire,
    release,
    start: runtime.start,
    pause: runtime.pause,
    resume: runtime.resume,
    reset: runtime.reset,
  };
});
