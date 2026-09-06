export type TelemetrySourceKind = "local" | "websocket";
export const connectionLabels = {
  disconnected: "未连接",
  connecting: "连接中",
  connected: "已连接",
  reconnecting: "重连中",
  error: "连接错误",
} as const;
export type ConnectionStatus = keyof typeof connectionLabels;
export const sourceLabels = { local: "LOCAL SIMULATOR", websocket: "BACKEND WEBSOCKET" } as const;
export const websocketConfig = {
  reconnectInitialDelay: 1000,
  reconnectMaxDelay: 30000,
  connectTimeout: 10000,
  maxMessageLength: 16384,
} as const;
export const telemetrySourceConfig = {
  source: (import.meta.env?.VITE_TELEMETRY_SOURCE ?? "local") as TelemetrySourceKind,
  url: import.meta.env?.VITE_TELEMETRY_WS_URL ?? "ws://127.0.0.1:8000/ws/telemetry",
};
