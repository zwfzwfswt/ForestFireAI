import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import { defineStore } from "pinia";
import { useUavStore } from "./uav";
import { useTelemetryStore } from "./telemetry";
import { createLocalSimulatorSource } from "../views/uav/telemetry/dataSources/localSimulatorSource";
import { createWebsocketSource } from "../views/uav/telemetry/dataSources/websocketSource";
import type {
  ConnectionState,
  TelemetryDataSource,
} from "../views/uav/telemetry/dataSources/types";
import { telemetrySourceConfig } from "../views/uav/telemetry/config";
import type { TelemetrySourceKind } from "../views/uav/telemetry/config";
import type { SimulatorState } from "../views/uav/simulator/runtime";

// Retain the existing control/session API; both transports enter the same telemetry store.
export const useUavSimulatorStore = defineStore("uav-simulator", () => {
  const assets = useUavStore();
  const telemetry = useTelemetryStore();
  const state = shallowRef<SimulatorState>({
    mode: "stopped",
    pausedIds: [],
    eligibleIds: [],
    timerActive: false,
  });
  const selectedSource = ref<TelemetrySourceKind>(
    telemetrySourceConfig.source === "websocket" ? "websocket" : "local"
  );
  const source = computed(() => selectedSource.value);
  const connection = shallowRef<ConnectionState>({
    status: "disconnected",
    error: "",
    retryDelay: 0,
  });
  const owners = new Set<symbol>();
  let requested = source.value === "websocket";
  const local = createLocalSimulatorSource({
    assets: () => assets.list,
    // Expiry has its own view-scoped clock, including while disconnected.
    clock: () => {},
    reset: telemetry.reset,
    remove: telemetry.remove,
    changed: (value) => {
      state.value = value;
    },
  });
  const websocket = createWebsocketSource({ url: telemetrySourceConfig.url });
  let current: TelemetryDataSource;
  let unsubscribe = () => {};
  let unsubscribeState = () => {};
  function bind() {
    unsubscribe();
    unsubscribeState();
    current = source.value === "local" ? local : websocket;
    unsubscribe = current.subscribe((packet) => {
      telemetry.updateTelemetry(packet);
    });
    unsubscribeState = current.subscribeState((value) => {
      connection.value = value;
    });
  }
  bind();
  if (!["local", "websocket"].includes(telemetrySourceConfig.source)) {
    connection.value = {
      status: "error",
      error: "VITE_TELEMETRY_SOURCE 只能为 local 或 websocket",
      retryDelay: 0,
    };
  }
  function start() {
    requested = true;
    if (owners.size) current.start();
  }
  function stop() {
    requested = false;
    current.stop();
  }
  function reset() {
    stop();
    local.reset();
    telemetry.reset();
  }
  function setSource(kind: TelemetrySourceKind) {
    if (!["local", "websocket"].includes(kind) || kind === source.value) return;
    current.stop();
    local.reset();
    telemetry.reset();
    selectedSource.value = kind;
    bind();
    requested = kind === "websocket";
    if (requested && owners.size) current.start();
  }
  watch(() => assets.list, local.reconcile, { immediate: true, flush: "sync" });
  watch(() => assets.sessionVersion, reset, { flush: "sync" });
  function acquire(owner: symbol) {
    const first = owners.size === 0;
    owners.add(owner);
    if (first) {
      telemetry.startClock();
      if (requested) current.start();
    }
  }
  function release(owner: symbol) {
    owners.delete(owner);
    if (!owners.size) {
      current.stop();
      telemetry.stopClock();
    }
  }
  onScopeDispose(() => {
    owners.clear();
    current.stop();
    telemetry.stopClock();
    unsubscribe();
    unsubscribeState();
  });
  return {
    state,
    source,
    connection,
    acquire,
    release,
    start,
    stop,
    reset,
    setSource,
    pause: (id?: string) => {
      if (source.value === "local") local.pause(id);
    },
    resume: (id?: string) => {
      if (source.value === "local") local.resume(id);
    },
  };
});
