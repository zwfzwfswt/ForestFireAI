import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
import {
  createContainer,
  createLeafletStub,
} from "../../dashboard/components/map/testing/leafletStub.mjs";

const root = dirname(fileURLToPath(import.meta.url)),
  cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  const source = ts
    .transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(
      /from ["']([^"']+)["']/g,
      (_, specifier) =>
        `from ${JSON.stringify(specifier.startsWith(".") ? moduleUrl(resolve(dirname(file), `${specifier}.ts`)) : import.meta.resolve(specifier))}`
    );
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url);
  return url;
}
const load = (file) => import(moduleUrl(resolve(root, file)));
const { createWebsocketSource, parseTelemetryMessage } = await load(
  "dataSources/websocketSource.ts"
);
const { createLocalSimulatorSource } = await load("dataSources/localSimulatorSource.ts");
const { websocketConfig } = await load("config.ts");
const { useTelemetryStore } = await load("../../../stores/telemetry.ts");
const { useUavStore } = await load("../../../stores/uav.ts");
const { useUavSimulatorStore } = await load("../../../stores/uavSimulator.ts");
const { createMockUavs } = await load("../mock.ts");
const { useUavMapLayer } = await load(
  "../../dashboard/components/map/composables/useUavMapLayer.ts"
);
const { useBusinessLayers } = await load(
  "../../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { createMapLayerRegistry } = await load(
  "../../dashboard/components/map/layers/mapLayerRegistry.ts"
);

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url;
    this.closed = false;
    FakeSocket.sockets.push(this);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.({});
  }
  message(value) {
    this.onmessage?.({ data: typeof value === "string" ? value : JSON.stringify(value) });
  }
  drop() {
    this.onclose?.({});
  }
  error() {
    this.onerror?.({});
  }
}
function fakeTimers() {
  let id = 0;
  const timers = new Map();
  return {
    timers,
    schedule: (callback, delay) => {
      timers.set(++id, { callback, delay });
      return id;
    },
    cancel: (id) => timers.delete(id),
    fire: (delay) => {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `No ${delay} ms timer`);
      timers.delete(entry[0]);
      entry[1].callback();
    },
  };
}
function packet(timestamp = Date.now(), extra = {}) {
  return {
    type: "telemetry",
    uavId: "mock-uav-1",
    timestamp: new Date(timestamp).toISOString(),
    longitude: 119.6,
    latitude: 30.2,
    altitude: 100,
    speed: 5,
    heading: 90,
    battery: 85,
    signal: 90,
    status: "online",
    ...extra,
  };
}
function websocket() {
  FakeSocket.sockets = [];
  const clock = fakeTimers(),
    states = [],
    packets = [];
  const source = createWebsocketSource({
    url: "ws://example.test/ws/telemetry",
    createSocket: (url) => new FakeSocket(url),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  source.subscribeState((state) => states.push(state));
  source.subscribe((p) => packets.push(p));
  return { source, clock, states, packets, socket: () => FakeSocket.sockets.at(-1) };
}

test("unavailable signal stays null; missing/invalid signal rejected; unknown asset warns without creation", () => {
  setActivePinia(createPinia());
  const assets = useUavStore();
  const telemetry = useTelemetryStore();
  const now = Date.now();
  const parsed = parseTelemetryMessage(JSON.stringify(packet(now, { signal: null })));
  assert.equal(parsed.signal, null);
  assert.equal(telemetry.updateTelemetry(parsed, now), true);
  assets.select(parsed.uavId);
  assert.equal(assets.selectedUav.telemetry.signal, null);
  assert.equal(telemetry.tracksByUavId[parsed.uavId].length, 1);
  telemetry.now = now + 5001;
  assert.equal(assets.selectedUav.status, "offline");
  for (const signal of [undefined, "90", false, -1, 101]) {
    assert.equal(parseTelemetryMessage(JSON.stringify(packet(now, { signal }))), null);
  }
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.equal(telemetry.updateTelemetry({ ...parsed, uavId: "not-an-asset" }, now), false);
    assert.equal(telemetry.updateTelemetry({ ...parsed, uavId: "not-an-asset" }, now), false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /UAV Asset not found/);
    assert.equal(assets.list.length, 8);
  } finally {
    console.warn = warn;
    telemetry.$dispose();
    assets.$dispose();
  }
});
test("local source uses the same subscribe/start/stop contract and retains pause controls", () => {
  const timers = fakeTimers();
  const packets = [];
  let now = Date.now(),
    state;
  const source = createLocalSimulatorSource({
    assets: createMockUavs,
    now: () => now,
    schedule: timers.schedule,
    cancel: timers.cancel,
    clock: () => {},
    reset: () => {},
    remove: () => {},
    changed: (value) => {
      state = value;
    },
  });
  const listener = (packet) => packets.push(packet);
  source.subscribe(listener);
  source.start();
  source.start();
  assert.equal(packets.length, 5);
  assert.equal(timers.timers.size, 1);
  now += 1000;
  timers.timers.values().next().value.callback();
  assert.equal(packets.length, 10);
  source.pause();
  assert.equal(state.mode, "paused");
  source.resume();
  assert.equal(state.mode, "running");
  source.unsubscribe(listener);
  const count = packets.length;
  now += 1000;
  timers.timers.values().next().value.callback();
  assert.equal(packets.length, count);
  source.stop();
  assert.equal(timers.timers.size, 0);
});
test("websocket connecting/connected/disconnected, protocol mapping and unsubscribe", () => {
  const c = websocket();
  c.source.start();
  c.source.start();
  assert.equal(FakeSocket.sockets.length, 1);
  assert.equal(c.states.at(-1).status, "connecting");
  c.socket().open();
  assert.equal(c.states.at(-1).status, "connected");
  c.socket().message(packet());
  assert.equal(typeof c.packets[0].timestamp, "number");
  let count = 0;
  const unsubscribe = c.source.subscribe(() => count++);
  unsubscribe();
  c.socket().message(packet());
  assert.equal(count, 0);
  c.source.stop();
  assert.equal(c.states.at(-1).status, "disconnected");
  assert.equal(c.clock.timers.size, 0);
  assert.ok(c.socket().closed);
});
test("exponential reconnect 1s/2s/4s capped at 30s; handshakes alone do not reset backoff", () => {
  const c = websocket();
  c.source.start();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    c.socket().open();
    c.socket().drop();
    assert.equal(c.states.at(-1).status, "reconnecting");
    assert.equal(c.states.at(-1).retryDelay, delay);
    c.clock.fire(delay);
  }
  c.socket().open();
  c.socket().message(packet());
  c.socket().drop();
  assert.equal(c.states.at(-1).retryDelay, 1000);
  c.source.stop();
});
test("socket errors and handshake timeout reconnect; invalid URLs remain error without hot loop", () => {
  const c = websocket();
  c.source.start();
  c.socket().error();
  assert.ok(c.states.some((state) => state.status === "error"));
  c.clock.fire(1000);
  c.clock.fire(websocketConfig.connectTimeout);
  assert.equal(c.states.at(-1).retryDelay, 2000);
  c.source.stop();
  for (const url of ["http://example.test", "bad url", "ws://user:secret@example.test"]) {
    const source = createWebsocketSource({ url });
    let state;
    source.subscribeState((value) => {
      state = value;
    });
    source.start();
    assert.equal(state.status, "error");
    source.stop();
  }
});
test("stop detaches listeners and cancels both queued reconnect and handshake callbacks", () => {
  const c = websocket();
  c.source.start();
  const old = c.socket(),
    lateMessage = old.onmessage,
    lateOpen = old.onopen;
  old.drop();
  const retry = [...c.clock.timers.values()][0].callback;
  c.source.stop();
  retry();
  lateOpen({});
  lateMessage({ data: JSON.stringify(packet()) });
  assert.equal(c.packets.length, 0);
  assert.equal(FakeSocket.sockets.length, 1);
  assert.equal(old.onmessage, null);
  c.source.start();
  assert.equal(FakeSocket.sockets.length, 2);
  c.source.stop();
});
test("malformed, oversized, wrong-type and non-finite telemetry is discarded", () => {
  for (const raw of [
    "bad",
    "null",
    "[]",
    "x".repeat(17000),
    JSON.stringify(packet(Date.now(), { type: "command" })),
    JSON.stringify(packet(Date.now(), { timestamp: "today" })),
    JSON.stringify(packet(Date.now(), { longitude: "119.5" })),
    JSON.stringify(packet(Date.now(), { latitude: 91 })),
    JSON.stringify(packet(Date.now(), { signal: 101 })),
    JSON.stringify(packet(Date.now(), { status: "bad" })),
  ])
    assert.equal(parseTelemetryMessage(raw), null);
});
test("websocket enters existing store: dedup, unknown IDs, stale per UAV, bounded tracks and reused markers", () => {
  setActivePinia(createPinia());
  const assets = useUavStore(),
    telemetry = useTelemetryStore();
  const { L } = createLeafletStub(),
    map = L.map(createContainer()),
    scope = effectScope();
  const registry = createMapLayerRegistry(map, L.layerGroup),
    drawing = registry.register("DrawingLayer");
  drawing.addLayer(L.marker([30, 119]));
  const mode = ref(false),
    adapter = scope.run(() => useUavMapLayer(() => mode.value)),
    business = scope.run(useBusinessLayers);
  business.attach(registry, L, {
    UAVLayer: adapter.factory(L),
    UAVTrackLayer: adapter.trackFactory(L),
  });
  scope.run(() => adapter.attach(map, L, registry));
  const markers = registry.get("UAVLayer").getLayers()[0].getLayers();
  const c = websocket();
  let now = Date.now();
  c.source.subscribe((p) => telemetry.updateTelemetry(p, now));
  c.source.start();
  c.socket().open();
  for (let i = 0; i < 310; i++) {
    now += 1000;
    c.socket().message(packet(now, { longitude: 119.6 + i * 0.00001 }));
  }
  const saved = telemetry.getLatestTelemetry("mock-uav-1");
  c.socket().message(packet(now));
  c.socket().message(packet(now, { uavId: "unknown" }));
  assert.equal(telemetry.getLatestTelemetry("mock-uav-1"), saved);
  assert.equal(Object.keys(telemetry.latestTelemetryByUavId).length, 1);
  assert.equal(telemetry.tracksByUavId["mock-uav-1"].length, 300);
  assert.equal(registry.get("UAVLayer").getLayers()[0].getLayers()[0], markers[0]);
  assert.deepEqual(markers[0].coordinates, [saved.latitude, saved.longitude]);
  assets.select("mock-uav-1");
  telemetry.now = now + 5001;
  assert.equal(assets.selectedUav.status, "offline");
  now += 6000;
  c.socket().message(packet(now));
  assert.equal(assets.selectedUav.status, "online");
  registry.hide("UAVTrackLayer");
  assert.equal(map.hasLayer(registry.get("UAVTrackLayer")), false);
  registry.show("UAVTrackLayer");
  registry.clear("DrawingLayer");
  assert.equal(registry.getState("UAVTrackLayer").featureCount, 1);
  assert.equal(registry.getState("FireEventLayer").featureCount, 2);
  c.source.stop();
  adapter.detach();
  scope.stop();
  registry.dispose();
});
test("source switch is exclusive, keeps assets, rejects late messages, stops on last owner/session reset", () => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  FakeSocket.sockets = [];
  setActivePinia(createPinia());
  const assets = useUavStore(),
    telemetry = useTelemetryStore(),
    control = useUavSimulatorStore();
  const a = Symbol(),
    b = Symbol();
  try {
    control.acquire(a);
    control.start();
    assert.equal(Object.keys(telemetry.latestTelemetryByUavId).length, 5);
    control.setSource("websocket");
    assert.equal(control.state.timerActive, false);
    assert.deepEqual(telemetry.tracksByUavId, {});
    const socket = FakeSocket.sockets.at(-1);
    socket.open();
    socket.message(packet());
    assert.equal(telemetry.getLatestTelemetry("mock-uav-1").battery, 85);
    const oldMessage = socket.onmessage;
    control.acquire(b);
    control.release(a);
    assert.equal(socket.closed, false);
    control.release(b);
    assert.equal(socket.closed, true);
    assert.equal(control.connection.status, "disconnected");
    control.acquire(a);
    assert.equal(FakeSocket.sockets.length, 2);
    control.setSource("local");
    oldMessage({ data: JSON.stringify(packet()) });
    assert.deepEqual(telemetry.latestTelemetryByUavId, {});
    assert.equal(assets.list.length, 8);
    control.start();
    assert.equal(control.state.timerActive, true);
    assets.reset();
    assert.equal(control.connection.status, "disconnected");
    assert.equal(control.state.mode, "stopped");
  } finally {
    control.release(a);
    control.release(b);
    control.$dispose();
    telemetry.$dispose();
    globalThis.WebSocket = original;
  }
});
