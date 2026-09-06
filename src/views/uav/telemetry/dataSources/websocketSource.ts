import type { UavTelemetry } from "../../simulator/types";
import { uavStatuses } from "../../config";
import { websocketConfig } from "../config";
import type { TelemetryDataSource } from "./types";
import { createSourceEvents } from "./types";

/** Wire UTC ISO timestamp -> store epoch ms. Untrusted network data is never cast directly. */
export function parseTelemetryMessage(raw: unknown): UavTelemetry | null {
  if (typeof raw !== "string" || raw.length > websocketConfig.maxMessageLength) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      value.type !== "telemetry" ||
      typeof value.uavId !== "string" ||
      !value.uavId ||
      value.uavId.length > 80 ||
      typeof value.timestamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value.timestamp) ||
      ![
        value.longitude,
        value.latitude,
        value.altitude,
        value.speed,
        value.heading,
        value.battery,
        value.signal,
      ].every((n) => typeof n === "number" && Number.isFinite(n)) ||
      Math.abs(value.longitude) > 180 ||
      Math.abs(value.latitude) > 90 ||
      value.speed < 0 ||
      value.heading < 0 ||
      value.heading >= 360 ||
      value.battery < 0 ||
      value.battery > 100 ||
      value.signal < 0 ||
      value.signal > 100 ||
      typeof value.status !== "string" ||
      !Object.hasOwn(uavStatuses, value.status)
    )
      return null;
    const timestamp = Date.parse(value.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0) return null;
    if (new Date(timestamp).toISOString().slice(0, 19) !== value.timestamp.slice(0, 19))
      return null;
    return {
      uavId: value.uavId,
      timestamp,
      longitude: value.longitude,
      latitude: value.latitude,
      altitude: value.altitude,
      speed: value.speed,
      heading: value.heading,
      battery: value.battery,
      signal: value.signal,
      status: value.status,
    };
  } catch {
    return null;
  }
}

type Socket = Pick<WebSocket, "onopen" | "onclose" | "onerror" | "onmessage" | "close">;
interface Options {
  url: string;
  createSocket?: (url: string) => Socket;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}
export function createWebsocketSource(options: Options): TelemetryDataSource {
  const events = createSourceEvents();
  const schedule =
    options.schedule ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const cancel = options.cancel ?? clearTimeout;
  const createSocket = options.createSocket ?? ((url) => new WebSocket(url));
  let socket: Socket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let generation = 0;
  let attempts = 0;
  const clearTimers = () => {
    if (retryTimer !== undefined) cancel(retryTimer);
    if (connectTimer !== undefined) cancel(connectTimer);
    retryTimer = undefined;
    connectTimer = undefined;
  };
  function detach() {
    const previous = socket;
    socket = undefined;
    if (previous) {
      previous.onopen = previous.onclose = previous.onerror = previous.onmessage = null;
      try {
        previous.close();
      } catch {
        /* A failed handshake can already be closed. */
      }
    }
  }
  function retry(error: string) {
    if (!active || retryTimer !== undefined) return;
    clearTimers();
    detach();
    const token = ++generation;
    const delay = Math.min(
      websocketConfig.reconnectMaxDelay,
      websocketConfig.reconnectInitialDelay * 2 ** Math.min(attempts++, 10)
    );
    events.state({ status: "reconnecting", error, retryDelay: delay });
    retryTimer = schedule(() => {
      retryTimer = undefined;
      if (active && token === generation) connect(true);
    }, delay);
  }
  function connect(reconnecting = false) {
    const token = ++generation;
    events.state({
      status: reconnecting ? "reconnecting" : "connecting",
      error: "",
      retryDelay: 0,
    });
    try {
      const next = createSocket(options.url);
      socket = next;
      const current = () => active && token === generation && socket === next;
      next.onopen = () => {
        if (!current()) return;
        if (connectTimer !== undefined) cancel(connectTimer);
        connectTimer = undefined;
        events.state({ status: "connected", error: "", retryDelay: 0 });
      };
      next.onmessage = (event) => {
        if (!current()) return;
        const packet = parseTelemetryMessage(event.data);
        if (packet) {
          attempts = 0;
          events.emit(packet);
        }
      };
      next.onerror = () => {
        if (!current()) return;
        events.state({ status: "error", error: "WebSocket 连接失败", retryDelay: 0 });
        retry("WebSocket 连接失败");
      };
      next.onclose = () => {
        if (current()) retry("WebSocket 已断开");
      };
      connectTimer = schedule(() => {
        if (current()) retry("WebSocket 连接超时");
      }, websocketConfig.connectTimeout);
    } catch {
      events.state({ status: "error", error: "无法建立 WebSocket 连接", retryDelay: 0 });
      retry("无法建立 WebSocket 连接");
    }
  }
  return {
    subscribe: events.subscribe,
    unsubscribe: events.unsubscribe,
    subscribeState: events.subscribeState,
    start() {
      if (active) return;
      try {
        const url = new URL(options.url);
        if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.hash)
          throw new Error();
      } catch {
        events.state({
          status: "error",
          error: "请配置有效的 ws:// 或 wss:// 遥测地址",
          retryDelay: 0,
        });
        return;
      }
      active = true;
      attempts = 0;
      connect();
    },
    stop() {
      active = false;
      generation++;
      clearTimers();
      detach();
      attempts = 0;
      events.state({ status: "disconnected", error: "", retryDelay: 0 });
    },
  };
}
