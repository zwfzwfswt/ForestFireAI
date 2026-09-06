import type { Uav } from "../types";
import type { UavTelemetry } from "./types";
import { simulatorConfig } from "./config";
import { canSimulate, moveTelemetry, seedTelemetry } from "./motion";

export interface SimulatorState {
  mode: "stopped" | "running" | "paused";
  pausedIds: string[];
  eligibleIds: string[];
  timerActive: boolean;
}
interface Options {
  assets: () => readonly Uav[];
  packet: (packet: UavTelemetry, now: number) => void;
  clock: (now: number) => void;
  reset: () => void;
  remove: (id: string) => void;
  changed: (state: SimulatorState) => void;
  now?: () => number;
  schedule?: (callback: () => void, interval: number) => ReturnType<typeof setInterval>;
  cancel?: (timer: ReturnType<typeof setInterval>) => void;
}

// One scheduler for movement and expiry; suspension has no catch-up burst.
export function createUavSimulator(options: Options) {
  const now = options.now ?? Date.now;
  const schedule =
    options.schedule ??
    ((callback: () => void, interval: number) => globalThis.setInterval(callback, interval));
  const cancel = options.cancel ?? clearInterval;
  let timer: ReturnType<typeof setInterval> | undefined;
  let active = false;
  let mode: SimulatorState["mode"] = "stopped";
  let generation = 0;
  const packets = new Map<string, UavTelemetry>();
  const seeds = new Map<string, string>();
  const paused = new Set<string>();
  const eligible = () => options.assets().filter(canSimulate);
  const publish = () =>
    options.changed({
      mode,
      pausedIds: [...paused],
      eligibleIds: eligible().map((uav) => uav.id),
      timerActive: timer !== undefined,
    });
  function reconcile() {
    const assets = eligible();
    const ids = new Set(assets.map((uav) => uav.id));
    for (const id of new Set([...seeds.keys(), ...packets.keys()]))
      if (!ids.has(id)) {
        packets.delete(id);
        seeds.delete(id);
        paused.delete(id);
        options.remove(id);
      }
    for (const uav of assets) {
      const seed = `${uav.position.longitude}/${uav.position.latitude}/${uav.status}`;
      if (seeds.has(uav.id) && seeds.get(uav.id) !== seed) {
        packets.delete(uav.id);
        options.remove(uav.id);
      }
      seeds.set(uav.id, seed);
    }
    publish();
  }
  function emit(id: string, timestamp: number, move: boolean) {
    const uav = options.assets().find((item) => item.id === id);
    if (!uav || !canSimulate(uav)) return;
    const previous = packets.get(id);
    const packet = previous
      ? move
        ? moveTelemetry(previous, timestamp)
        : { ...previous, timestamp }
      : seedTelemetry(uav, timestamp);
    packets.set(id, packet);
    options.packet(packet, timestamp);
  }
  function heartbeat() {
    const timestamp = now();
    eligible().forEach((uav) => {
      if (!paused.has(uav.id)) emit(uav.id, timestamp, false);
    });
    options.clock(timestamp);
  }
  function stopTimer() {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function ensureTimer() {
    if (!active || mode === "stopped" || timer !== undefined) return;
    const token = ++generation;
    timer = schedule(() => {
      if (!active || token !== generation) return;
      const timestamp = now();
      if (mode === "running")
        eligible().forEach((uav) => {
          if (!paused.has(uav.id)) emit(uav.id, timestamp, true);
        });
      options.clock(timestamp);
    }, simulatorConfig.telemetryInterval);
  }
  function start() {
    if (mode === "running") return;
    mode = "running";
    paused.clear();
    reconcile();
    if (active) heartbeat();
    ensureTimer();
    publish();
  }
  function pause(id?: string) {
    if (mode === "stopped") return;
    if (id) {
      if (eligible().some((uav) => uav.id === id)) paused.add(id);
    } else mode = "paused";
    publish();
  }
  function resume(id?: string) {
    if (!id) {
      if (mode === "stopped") return;
      mode = "paused";
      start();
      return;
    }
    if (mode !== "running" || !paused.delete(id)) return;
    if (active) emit(id, now(), false);
    publish();
  }
  function reset() {
    stopTimer();
    mode = "stopped";
    packets.clear();
    seeds.clear();
    paused.clear();
    options.reset();
    publish();
  }
  return {
    start,
    pause,
    resume,
    reset,
    reconcile,
    activate() {
      if (active) return;
      active = true;
      options.clock(now());
      if (mode === "running") heartbeat();
      ensureTimer();
      publish();
    },
    suspend() {
      active = false;
      stopTimer();
      publish();
    },
  };
}
