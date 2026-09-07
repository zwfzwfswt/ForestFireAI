import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, ref } from "vue";
import ts from "typescript";
import {
  createContainer,
  createLeafletStub,
} from "../dashboard/components/map/testing/leafletStub.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  const source = ts
    .transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
      const target = specifier.startsWith(".")
        ? moduleUrl(resolve(dirname(file), `${specifier}.ts`))
        : import.meta.resolve(specifier);
      return `from ${JSON.stringify(target)}`;
    });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url);
  return url;
}
const load = (file) => import(moduleUrl(resolve(root, file)));
const { useUavStore } = await load("../../stores/uav.ts");
const { uavInput, validateUav, filterUavs } = await load("model.ts");
const { createMockUavs } = await load("mock.ts");
const { uavStatuses } = await load("config.ts");
const { withUavMockMenu } = await load("mockMenu.ts");
const { useUavMapLayer, uavPopup } = await load(
  "../dashboard/components/map/composables/useUavMapLayer.ts"
);
const { useBusinessLayers } = await load(
  "../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { createMapLayerRegistry } = await load(
  "../dashboard/components/map/layers/mapLayerRegistry.ts"
);
const { useMapDrawing } = await load("../dashboard/components/map/composables/useMapDrawing.ts");
const { registerDrawingPanes } = await load("../dashboard/components/map/layers/layerPanes.ts");
const newStore = () => {
  setActivePinia(createPinia());
  return useUavStore();
};
const newInput = () => ({
  ...uavInput(createMockUavs()[0]),
  name: "新增机",
  serialNumber: "NEW-SN",
});

test("八架独立 Mock 资产覆盖六种状态、完整字段、有效坐标和 UTC 时间", () => {
  const list = createMockUavs();
  assert.equal(list.length, 8);
  assert.equal(new Set(list.map((u) => u.id)).size, 8);
  assert.deepEqual(new Set(list.map((u) => u.status)), new Set(Object.keys(uavStatuses)));
  for (const uav of list) {
    assert.deepEqual(validateUav(uavInput(uav), list, uav.id), {});
    assert.ok(Math.abs(uav.position.longitude - 119.7) < 0.3);
    assert.ok(Math.abs(uav.position.latitude - 30.25) < 0.3);
    assert.match(uav.updatedAt, /Z$/);
    assert.equal(Object.keys(uav.payload).length, 5);
  }
  list[0].payload.camera = false;
  assert.equal(createMockUavs()[0].payload.camera, true);
});
test("列表搜索名称/SN/单位，状态、型号可组合筛选，支持空结果", () => {
  const list = newStore().list;
  const all = { keyword: "", status: "", model: "" };
  assert.equal(filterUavs(list, all).length, 8);
  assert.equal(filterUavs(list, { ...all, keyword: " mock-ff-0001 " })[0].id, list[0].id);
  assert.equal(filterUavs(list, { ...all, keyword: "巡护机" }).length, 8);
  assert.equal(filterUavs(list, { ...all, keyword: "北部" }).length, 4);
  assert.equal(filterUavs(list, { ...all, status: "mission" }).length, 2);
  assert.equal(filterUavs(list, { ...all, status: "online", model: list[0].model }).length, 2);
  assert.equal(filterUavs(list, { ...all, keyword: "不存在" }).length, 0);
});
test("新增规范化字段，不伪造遥测；编辑保留身份与快照并同步选中详情", () => {
  const store = newStore();
  const input = newInput();
  input.name = " 新增机 ";
  const added = store.save(input);
  assert.equal(store.list.length, 9);
  assert.equal(added.name, "新增机");
  assert.equal(added.lastOnlineAt, null);
  assert.equal(added.position.altitude, null);
  assert.ok(Object.values(added.telemetry).every((value) => value === null));
  store.select(added.id);
  store.save({ ...uavInput(added), name: "修改后", status: "warning", longitude: 120 }, added.id);
  assert.equal(store.selectedUav.name, "修改后");
  assert.equal(store.selectedUav.position.longitude, 120);
  assert.equal(store.selectedUav.createdAt, added.createdAt);
  assert.equal(store.list.length, 9);
  assert.throws(() => store.save(input, "missing"), /不存在/);
});
test("SN 忽略大小写及空格判重，编辑自身允许，失败无部分写入", () => {
  const store = newStore();
  const before = store.list;
  assert.throws(() => store.save({ ...newInput(), serialNumber: " mock-ff-0001 " }), /SN 已存在/);
  assert.equal(store.list, before);
  store.save(uavInput(store.list[0]), store.list[0].id);
  assert.throws(
    () =>
      store.save(
        { ...uavInput(store.list[1]), serialNumber: store.list[0].serialNumber },
        store.list[1].id
      ),
    /SN 已存在/
  );
});
test("必填、经纬度边界、NaN/无穷/空值、状态与载荷均验证", () => {
  const store = newStore();
  for (const field of ["name", "serialNumber", "model"])
    assert.throws(() => store.save({ ...newInput(), [field]: " " }));
  for (const [field, values] of [
    ["longitude", [181, -181, NaN, Infinity, undefined]],
    ["latitude", [91, -91, NaN, Infinity, undefined]],
  ]) {
    for (const value of values)
      assert.throws(() => store.save({ ...newInput(), [field]: value }), /经度|纬度/);
  }
  assert.throws(() => store.save({ ...newInput(), status: "flying" }), /状态/);
  assert.throws(() => store.save({ ...newInput(), payload: {} }), /载荷/);
  assert.equal(store.list.length, 8);
  assert.deepEqual(validateUav({ ...newInput(), longitude: -180, latitude: 90 }, []), {});
  assert.deepEqual(validateUav({ ...newInput(), longitude: 180, latitude: -90 }, []), {});
});
test("表单副本取消不污染资产；删除清除选中和待定位，重复删除无副作用", () => {
  const store = newStore();
  const uav = store.list[0];
  const draft = uavInput(uav);
  draft.payload.camera = false;
  assert.equal(uav.payload.camera, true);
  store.locate(uav.id);
  const token = store.locateRequest.token;
  store.consumeLocate(token - 1);
  assert.ok(store.locateRequest);
  store.remove(uav.id);
  assert.equal(store.selectedUav, null);
  assert.equal(store.selectedId, null);
  assert.equal(store.locateRequest, null);
  store.remove(uav.id);
  assert.equal(store.list.length, 7);
  assert.equal(store.locate(uav.id), false);
});
test("跨页面复用同一 store；会话重置恢复样例，不跨 Pinia 实例共享修改", () => {
  const store = newStore();
  store.save(newInput());
  assert.equal(useUavStore().list.length, 9);
  store.locate(store.list[0].id);
  store.reset();
  assert.equal(store.list.length, 8);
  assert.equal(store.selectedUav, null);
  assert.equal(store.locateRequest, null);
  assert.equal(store.sessionVersion, 1);
  store.remove(store.list[0].id);
  assert.equal(useUavStore(createPinia()).list.length, 8);
});

function mountMap(store = newStore()) {
  const scope = effectScope();
  const { L } = createLeafletStub();
  const map = L.map(createContainer());
  const drawing = useMapDrawing();
  const drawingActive = ref(false);
  const business = useBusinessLayers();
  const registry = createMapLayerRegistry(map, L.layerGroup, business.publish);
  registerDrawingPanes(map);
  let adapter;
  scope.run(() => {
    adapter = useUavMapLayer(() => drawingActive.value);
    business.attach(registry, L, { UAVLayer: adapter.factory(L) });
    drawing.attach(map, L, registry);
    adapter.attach(map, L, registry);
  });
  const markers = () => registry.get("UAVLayer").getLayers()[0].getLayers();
  return {
    store,
    L,
    map,
    registry,
    drawing,
    drawingActive,
    markers,
    close() {
      adapter.detach();
      drawing.detach();
      business.detach();
      registry.dispose();
      map.remove();
      scope.stop();
    },
  };
}
test("UAV 独立 Marker 位于注册组与专用 pane，六种状态符号不同，Popup 转义外部文本", () => {
  const context = mountMap();
  try {
    const { store, markers, registry } = context;
    assert.equal(registry.getState("UAVLayer").featureCount, 8);
    assert.equal(markers().length, 8);
    assert.ok(markers().every((marker) => marker.options.pane === "ff-business-UAVLayer"));
    assert.equal(new Set(markers().map((marker) => marker.options.icon.html)).size, 6);
    markers()[0].fire("click");
    assert.equal(store.selectedUav.id, store.list[0].id);
    assert.match(markers()[0].popup.content, /型号.*状态.*电量.*高度/);
    assert.match(uavPopup({ ...store.list[0], name: '<img src=x onerror="x">' }), /&lt;img/);
    assert.doesNotMatch(uavPopup({ ...store.list[0], name: "<script>" }), /<script>/);
  } finally {
    context.close();
  }
});
test("新增/编辑/删除实时更新 UAV 标记，隐藏与透明度保留，Drawing/Fire/Risk 不受影响", () => {
  const c = mountMap();
  try {
    c.drawing.select("point");
    c.map.fire("click", { latlng: { lat: 30, lng: 119 } });
    const fire = c.registry.get("FireEventLayer");
    const risk = c.registry.get("HighRiskLayer");
    const fireState = c.registry.getState("FireEventLayer");
    c.registry.hide("UAVLayer");
    c.registry.setOpacity("UAVLayer", 0.35);
    const added = c.store.save(newInput());
    assert.equal(c.markers().length, 9);
    assert.equal(c.map.hasLayer(c.registry.get("UAVLayer")), false);
    c.store.save({ ...uavInput(added), latitude: 31, status: "warning" }, added.id);
    assert.deepEqual(c.markers().at(-1).coordinates, [31, added.position.longitude]);
    const oldMarker = c.markers().at(-1);
    c.registry.show("UAVLayer");
    assert.equal(c.map.getPane("ff-business-UAVLayer").style.opacity, "0.35");
    c.store.remove(added.id);
    assert.equal(c.markers().length, 8);
    assert.equal(c.map.hasLayer(oldMarker), false);
    assert.equal(oldMarker.events.size, 0);
    assert.equal(c.drawing.count.value, 1);
    c.drawing.clear();
    assert.equal(c.markers().length, 8);
    assert.equal(c.registry.get("FireEventLayer"), fire);
    assert.equal(c.registry.get("HighRiskLayer"), risk);
    assert.deepEqual(c.registry.getState("FireEventLayer"), fireState);
  } finally {
    c.close();
  }
});
test("定位请求在地图挂载后消费，自动显示 UAV；绘制时点击不抢占详情", async () => {
  const store = newStore();
  store.locate(store.list[2].id);
  const c = mountMap(store);
  try {
    assert.deepEqual(c.map.center, [
      store.list[2].position.latitude,
      store.list[2].position.longitude,
    ]);
    assert.equal(store.locateRequest, null);
    c.registry.hide("UAVLayer");
    c.registry.setOpacity("UAVLayer", 0);
    store.locate(store.list[0].id);
    assert.equal(c.registry.getState("UAVLayer").visible, true);
    assert.equal(c.registry.getState("UAVLayer").opacity, 1);
    c.drawingActive.value = true;
    await nextTick();
    c.markers()[1].fire("click");
    assert.equal(store.selectedUav.id, store.list[0].id);
    assert.ok(c.markers().every((marker) => !marker.popup));
  } finally {
    c.close();
  }
});
test("地图销毁停止数据监听，停用期间 CRUD 在重新挂载时恢复；删除全部为空层", () => {
  const store = newStore();
  const first = mountMap(store);
  first.close();
  store.remove(store.list[0].id);
  store.save(newInput());
  assert.equal(first.map.layers.size, 0);
  const second = mountMap(store);
  try {
    assert.equal(second.markers().length, 8);
    assert.ok(second.markers().some((m) => m.options.title.includes("新增机")));
    for (const uav of [...store.list]) store.remove(uav.id);
    assert.equal(second.registry.getState("UAVLayer").status, "empty");
    assert.equal(second.markers().length, 0);
    store.save(newInput());
    assert.equal(second.registry.getState("UAVLayer").status, "ready");
  } finally {
    second.close();
  }
});
test("Registry 替换失败保留已有业务层，拒绝通过业务接口替换 Drawing", () => {
  const c = mountMap();
  try {
    const old = c.registry.get("UAVLayer").getLayers()[0];
    assert.throws(
      () =>
        c.registry.replaceBusiness("UAVLayer", () => {
          throw new Error("bad");
        }),
      /bad/
    );
    assert.throws(
      () =>
        c.registry.replaceBusiness("UAVLayer", () => ({
          layer: c.L.layerGroup(),
          featureCount: -1,
        })),
      /数量/
    );
    assert.equal(c.registry.get("UAVLayer").getLayers()[0], old);
    assert.throws(() => c.registry.replaceBusiness("DrawingLayer", () => ({})), /未注册业务/);
  } finally {
    c.close();
  }
});
test("本地菜单沿用 RouteItem，重复生成无重复项，冲突时保留上游路由", () => {
  const existing = [{ path: "/system", children: [] }];
  const routes = withUavMockMenu(existing);
  assert.equal(existing.length, 1);
  assert.equal(routes[0], existing[0]);
  assert.equal(routes[1].component, "Layout");
  assert.equal(routes[1].children[0].component, "uav/index");
  assert.equal(routes[1].children[0].name, "UavAssets");
  assert.equal(withUavMockMenu(routes), routes);
  const remote = [{ path: "/uav", children: [] }];
  assert.equal(withUavMockMenu(remote), remote);
  const permission = readFileSync(resolve(root, "../../stores/permission.ts"), "utf8");
  assert.match(
    permission,
    /withRemoteSensingMockMenu\(withFireMockMenu\(withUavMockMenu\(routeData\)\)\)/
  );
  for (const file of ["user", "tenant"])
    assert.match(
      readFileSync(resolve(root, `../../stores/${file}.ts`), "utf8"),
      /useUavStore\(store\)\.reset\(\)/
    );
});
