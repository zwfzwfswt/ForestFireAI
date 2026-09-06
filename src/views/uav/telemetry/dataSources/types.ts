import type { UavTelemetry } from "../../simulator/types";
import type { ConnectionStatus } from "../config";

export type TelemetryListener = (packet: UavTelemetry) => void;
export interface ConnectionState {
  status: ConnectionStatus;
  error: string;
  retryDelay: number;
}
export interface TelemetryDataSource {
  start(): void;
  stop(): void;
  subscribe(listener: TelemetryListener): () => void;
  unsubscribe(listener: TelemetryListener): void;
  subscribeState(listener: (state: ConnectionState) => void): () => void;
}

// Transport-local subscriptions, never stored as reactive Pinia data.
export function createSourceEvents() {
  const listeners = new Set<TelemetryListener>();
  const stateListeners = new Set<(state: ConnectionState) => void>();
  let state: ConnectionState = { status: "disconnected", error: "", retryDelay: 0 };
  return {
    subscribe(listener: TelemetryListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unsubscribe(listener: TelemetryListener) {
      listeners.delete(listener);
    },
    subscribeState(listener: (state: ConnectionState) => void) {
      stateListeners.add(listener);
      listener({ ...state });
      return () => {
        stateListeners.delete(listener);
      };
    },
    emit(packet: UavTelemetry) {
      listeners.forEach((listener) => listener(packet));
    },
    state(value: ConnectionState) {
      state = value;
      stateListeners.forEach((listener) => listener({ ...value }));
    },
  };
}
