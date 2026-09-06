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
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  const source = ts
    .transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(
      /from ["']([^"']+)["']/g,
      (_, name) =>
        `from ${JSON.stringify(name.startsWith(".") ? moduleUrl(resolve(dirname(file), `${name}.ts`)) : import.meta.resolve(name))}`
    );
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url);
  return url;
}
const load = (file) => import(moduleUrl(resolve(root, file)));
const { createUavSimulator } = await load("runtime.ts");
const { seedTelemetry, moveTelemetry, canSimulate } = await load("motion.ts");
const { simulatorConfig: config } = await load("config.ts");
const { useUavStore } = await load("../../../stores/uav.ts");
const { useTelemetryStore } = await load("../../../stores/telemetry.ts");
const { useUavSimulatorStore } = await load("../../../stores/uavSimulator.ts");
const { uavInput } = await load("../model.ts");
const { useUavMapLayer } = await load(
  "../../dashboard/components/map/composables/useUavMapLayer.ts"
);
const { useBusinessLayers } = await load(
  "../../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { createMapLayerRegistry } = await load(
  "../../dashboard/components/map/layers/mapLayerRegistry.ts"
);
function setup() {
  setActivePinia(createPinia());
  const assets = useUavStore(),
    telemetry = useTelemetryStore();
  let now = 100000,
    sequence = 0,
    state;
  const timers = new Map();
  const removed = [];
  const runtime = createUavSimulator({
    assets: () => assets.list,
    now: () => now,
    schedule: (callback, interval) => {
      assert.equal(interval, config.telemetryInterval);
      timers.set(++sequence, callback);
      return sequence;
    },
    cancel: (id) => timers.delete(id),
    packet: (packet, time) => telemetry.updateTelemetry(packet, time),
    clock: (time) => {
      telemetry.now = time;
    },
    reset: telemetry.reset,
    remove: (id) => {
      removed.push(id);
      telemetry.remove(id);
    },
    changed: (value) => {
      state = value;
    },
  });
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      now += 1000;
      [...timers.values()].forEach((callback) => callback());
    }
  };
  return { assets, telemetry, runtime, timers, tick, removed, state: () => state, time: () => now };
}
test("尚未启动时删除资产也释放模拟种子，避免反复 CRUD 留下内部记录", () => {
  const c = setup();
  c.runtime.reconcile();
  const id = c.assets.list[0].id;
  c.assets.remove(id);
  c.runtime.reconcile();
  assert.ok(c.removed.includes(id));
});
test("启动五架、重复启动/激活只有一个 timer，暂停全部保留离线时钟，停止防迟到回调", () => {
  const c = setup();
  c.runtime.activate();
  c.runtime.start();
  c.runtime.start();
  c.runtime.activate();
  assert.equal(c.timers.size, 1);
  assert.equal(Object.keys(c.telemetry.latestTelemetryByUavId).length, 5);
  const callback = [...c.timers.values()][0];
  c.runtime.pause();
  c.tick(6);
  assert.equal(
    c.assets.displayList.filter((uav) => uav.telemetryUpdatedAt && uav.status === "offline").length,
    5
  );
  c.runtime.suspend();
  assert.equal(c.timers.size, 0);
  const packets = c.telemetry.latestTelemetryByUavId;
  callback();
  assert.equal(c.telemetry.latestTelemetryByUavId, packets);
  c.runtime.reset();
  assert.equal(c.state().mode, "stopped");
});
test("600 秒连续运动、航向变化、电量下降、边界约束；五架遥测和轨迹严格有界", () => {
  const c = setup();
  c.runtime.activate();
  c.runtime.start();
  const first = c.telemetry.getLatestTelemetry(c.assets.list[0].id);
  for (let i = 0; i < 600; i++) {
    const previous = c.telemetry.latestTelemetryByUavId;
    c.tick();
    for (const packet of Object.values(c.telemetry.latestTelemetryByUavId)) {
      const old = previous[packet.uavId];
      const metres = Math.hypot(
        (packet.longitude - old.longitude) * 111195 * Math.cos((packet.latitude * Math.PI) / 180),
        (packet.latitude - old.latitude) * 111195
      );
      assert.ok(metres <= packet.speed * 1.001 && metres > 0);
      const b = config.simulationBounds;
      assert.ok(
        packet.longitude >= b.west &&
          packet.longitude <= b.east &&
          packet.latitude >= b.south &&
          packet.latitude <= b.north
      );
    }
  }
  const last = c.telemetry.getLatestTelemetry(first.uavId);
  assert.notEqual(last.heading, first.heading);
  assert.ok(Math.abs(first.battery - last.battery - 3) < 1e-8);
  assert.equal(Object.keys(c.telemetry.latestTelemetryByUavId).length, 5);
  assert.ok(Object.values(c.telemetry.tracksByUavId).every((points) => points.length === 300));
  assert.equal(c.timers.size, 1);
});
test("边界转向与长时间挂起不造成坐标跳跃；不模拟范围外或非飞行状态资产", () => {
  const c = setup();
  const uav = c.assets.list[0];
  assert.equal(c.assets.list.filter(canSimulate).length, 5);
  assert.equal(canSimulate({ ...uav, position: { ...uav.position, longitude: 0 } }), false);
  const p = { ...seedTelemetry(uav, 1000), longitude: config.simulationBounds.east, heading: 90 };
  const moved = moveTelemetry(p, 100000);
  assert.ok(
    moved.longitude <= config.simulationBounds.east && Math.abs(moved.latitude - p.latitude) < 0.001
  );
  assert.ok(moved.heading > 180);
});
test("遥测更新拒绝未知 ID、无效坐标/数值/状态、未来和乱序；重置与删除不会保留历史", () => {
  const c = setup(),
    packet = seedTelemetry(c.assets.list[0], c.time());
  for (const invalid of [
    { uavId: "unknown" },
    { longitude: NaN },
    { latitude: 91 },
    { heading: 360 },
    { battery: -1 },
    { signal: 101 },
    { status: "bad" },
    { timestamp: c.time() + 1 },
  ])
    assert.equal(c.telemetry.updateTelemetry({ ...packet, ...invalid }, c.time()), false);
  assert.equal(c.telemetry.updateTelemetry(packet, c.time()), true);
  assert.equal(c.telemetry.updateTelemetry(packet, c.time()), false);
  assert.equal(
    c.telemetry.updateTelemetry({ ...packet, timestamp: c.time() - 1 }, c.time()),
    false
  );
  c.telemetry.remove(packet.uavId);
  assert.equal(c.telemetry.getLatestTelemetry(packet.uavId), undefined);
  assert.deepEqual(c.telemetry.tracksByUavId, {});
  c.telemetry.reset();
  assert.deepEqual(c.telemetry.latestTelemetryByUavId, {});
});
test("选中详情组合实时数据，资产/更新时间不变，单机严格超过五秒离线、恢复在线无追赶跳跃", () => {
  const c = setup(),
    asset = c.assets.list[0];
  c.assets.select(asset.id);
  c.runtime.activate();
  c.runtime.start();
  c.tick();
  assert.notEqual(c.assets.selectedUav.position.longitude, asset.position.longitude);
  assert.equal(c.assets.list[0], asset);
  assert.equal(c.assets.selectedUav.updatedAt, asset.updatedAt);
  c.runtime.pause(asset.id);
  const packet = c.telemetry.getLatestTelemetry(asset.id);
  c.tick(5);
  assert.equal(c.assets.selectedUav.status, "online");
  c.tick();
  assert.equal(c.assets.selectedUav.status, "offline");
  assert.equal(c.telemetry.getLatestTelemetry(asset.id), packet);
  c.runtime.resume(asset.id);
  assert.equal(c.assets.selectedUav.status, "online");
  assert.equal(c.telemetry.getLatestTelemetry(asset.id).longitude, packet.longitude);
  c.runtime.pause(asset.id);
  c.runtime.resume();
  assert.deepEqual(c.state().pausedIds, []);
});
test("暂停/激活/重置、删除和坐标编辑清理模拟状态；重置保留 CRUD", () => {
  const c = setup();
  c.runtime.activate();
  c.runtime.start();
  const id = c.assets.list[0].id;
  c.assets.remove(id);
  c.runtime.reconcile();
  c.tick();
  assert.equal(c.telemetry.getLatestTelemetry(id), undefined);
  const uav = c.assets.list.find(canSimulate);
  c.assets.save({ ...uavInput(uav), longitude: 119.6 }, uav.id);
  c.runtime.reconcile();
  c.tick();
  assert.equal(c.telemetry.tracksByUavId[uav.id].length, 1);
  c.runtime.suspend();
  c.tick(10);
  c.runtime.activate();
  assert.equal(c.timers.size, 1);
  c.runtime.reset();
  assert.equal(c.assets.list.length, 7);
  assert.deepEqual(c.telemetry.latestTelemetryByUavId, {});
  assert.equal(c.timers.size, 0);
});
test("Pinia 多页面租用同一调度器，重复释放安全，会话重置停止；最后释放与 scope dispose 清理", () => {
  const c = setup();
  const simulator = useUavSimulatorStore();
  const a = Symbol(),
    b = Symbol();
  simulator.acquire(a);
  simulator.acquire(a);
  simulator.start();
  simulator.acquire(b);
  assert.equal(simulator.state.timerActive, true);
  simulator.release(a);
  assert.equal(simulator.state.timerActive, true);
  simulator.release(b);
  assert.equal(simulator.state.timerActive, false);
  simulator.release(b);
  simulator.acquire(a);
  assert.equal(simulator.state.timerActive, true);
  c.assets.reset();
  assert.equal(simulator.state.mode, "stopped");
  assert.equal(simulator.state.timerActive, false);
  simulator.start();
  simulator.$dispose();
  assert.equal(simulator.state.timerActive, false);
});
test("600 tick Marker/Polyline 复用和移动，Popup 最新、轨迹/显隐/透明度隔离，删除及 detach 无监听残留", () => {
  const c = setup(),
    { L } = createLeafletStub(),
    map = L.map(createContainer());
  const scope = effectScope();
  const registry = createMapLayerRegistry(map, L.layerGroup);
  const drawing = registry.register("DrawingLayer");
  drawing.addLayer(L.marker([30, 119]));
  const mode = ref(false);
  const adapter = scope.run(() => useUavMapLayer(() => mode.value));
  const business = scope.run(() => useBusinessLayers());
  business.attach(registry, L, {
    UAVLayer: adapter.factory(L),
    UAVTrackLayer: adapter.trackFactory(L),
  });
  scope.run(() => adapter.attach(map, L, registry));
  const children = (id) => registry.get(id).getLayers()[0].getLayers();
  const markers = children("UAVLayer");
  c.runtime.activate();
  c.runtime.start();
  const tracks = children("UAVTrackLayer");
  registry.setOpacity("UAVLayer", 0.3);
  registry.hide("UAVTrackLayer");
  c.tick(600);
  assert.deepEqual(children("UAVLayer"), markers);
  assert.deepEqual(children("UAVTrackLayer"), tracks);
  assert.notDeepEqual(markers[0].coordinates, [
    c.assets.list[0].position.latitude,
    c.assets.list[0].position.longitude,
  ]);
  assert.match(markers[0].popup.content, /SIMULATOR/);
  assert.equal(registry.getState("UAVLayer").opacity, 0.3);
  assert.equal(map.hasLayer(registry.get("UAVTrackLayer")), false);
  registry.show("UAVTrackLayer");
  assert.ok(tracks.every((track) => track.coordinates.length === 300));
  registry.clear("DrawingLayer");
  assert.equal(children("UAVTrackLayer").length, 5);
  assert.equal(registry.getState("FireEventLayer").featureCount, 2);
  c.assets.remove(c.assets.list[0].id);
  assert.equal(children("UAVLayer").length, 7);
  assert.equal(children("UAVTrackLayer").length, 4);
  c.runtime.reset();
  assert.equal(children("UAVTrackLayer").length, 0);
  adapter.detach();
  scope.stop();
  assert.ok(markers.every((marker) => marker.events.size === 0));
  registry.dispose();
});
