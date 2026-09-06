import { createUavSimulator } from "../../simulator/runtime";
import type { TelemetryDataSource } from "./types";
import { createSourceEvents } from "./types";

type RuntimeOptions = Parameters<typeof createUavSimulator>[0];
export function createLocalSimulatorSource(options: Omit<RuntimeOptions, "packet">) {
  const events = createSourceEvents();
  let mode = "stopped";
  const runtime = createUavSimulator({
    ...options,
    packet: (packet) => events.emit(packet),
    changed: (state) => {
      mode = state.mode;
      options.changed(state);
    },
  });
  const source = {
    subscribe: events.subscribe,
    unsubscribe: events.unsubscribe,
    subscribeState: events.subscribeState,
    start() {
      if (mode === "stopped") runtime.start();
      runtime.activate();
      events.state({ status: "connected", error: "", retryDelay: 0 });
    },
    stop() {
      runtime.suspend();
      events.state({ status: "disconnected", error: "", retryDelay: 0 });
    },
    pause: runtime.pause,
    resume: runtime.resume,
    reconcile: runtime.reconcile,
    reset: runtime.reset,
  } satisfies TelemetryDataSource & Record<string, unknown>;
  return source;
}
