import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
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
const { useFireEventStore } = await load("../../stores/fireEvent.ts");
const { createMockFireEvents } = await load("mock.ts");
const { fireInput, validateFire, filterFireEvents } = await load("model.ts");
const { fireStatusConfig, fireLevelConfig, fireTransitions } = await load("config.ts");
const { withFireMockMenu } = await load("mockMenu.ts");
const { useFireMapLayer, firePopup } = await load(
  "../dashboard/components/map/composables/useFireMapLayer.ts"
);
const { useMapDrawing } = await load("../dashboard/components/map/composables/useMapDrawing.ts");
const { useBusinessLayers } = await load(
  "../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { createMapLayerRegistry } = await load(
  "../dashboard/components/map/layers/mapLayerRegistry.ts"
);
const { registerDrawingPanes } = await load("../dashboard/components/map/layers/layerPanes.ts");
const newStore = () => {
  setActivePinia(createPinia());
  return useFireEventStore();
};
const input = () => ({ ...fireInput(createMockFireEvents()[0]), title: "新增火情" });
const query = { keyword: "", status: "", level: "", source: "", from: "", to: "" };

test("十条 Mock 火情覆盖八种状态、多种来源和合法 WGS84 位置", () => {
  const events = createMockFireEvents();
  assert.equal(events.length, 10);
  assert.equal(new Set(events.map((e) => e.id)).size, 10);
  assert.equal(new Set(events.map((e) => e.code)).size, 10);
  assert.deepEqual(new Set(events.map((e) => e.status)), new Set(Object.keys(fireStatusConfig)));
  assert.equal(new Set(events.map((e) => e.source)).size, 7);
  for (const event of events) {
    assert.equal(validateFire(event), "");
    assert.ok(Math.abs(event.location.longitude - 119.7) < 0.3);
    assert.ok(Math.abs(event.location.latitude - 30.25) < 0.3);
    assert.deepEqual(event.alertIds, []);
    assert.match(event.detectedAt, /Z$/);
    assert.equal(event.timeline.at(-1)?.toStatus ?? "suspected", event.status);
  }
});
test("关键词搜索编号、标题、地址、负责人，忽略大小写及空格", () => {
  const events = newStore().events;
  for (const keyword of [events[0].code.toLowerCase(), events[0].title, "1 号巡护", "Mock 值班员"])
    assert.ok(filterFireEvents(events, { ...query, keyword: ` ${keyword} ` }).length);
  assert.equal(filterFireEvents(events, { ...query, keyword: "找不到" }).length, 0);
});
for (const field of ["status", "level", "source"])
  test(`${field} 分类筛选与组合筛选`, () => {
    const events = newStore().events;
    for (const value of new Set(events.map((e) => e[field])))
      assert.deepEqual(
        filterFireEvents(events, { ...query, [field]: value }),
        events.filter((e) => e[field] === value)
      );
    assert.equal(
      filterFireEvents(events, {
        ...query,
        status: events[0].status,
        level: events[0].level,
        source: events[0].source,
      }).length,
      1
    );
  });
test("时间筛选包含端点，逆序范围和空结果正确", () => {
  const events = newStore().events;
  assert.equal(
    filterFireEvents(events, { ...query, from: events[2].detectedAt, to: events[4].detectedAt })
      .length,
    3
  );
  assert.equal(
    filterFireEvents(events, { ...query, from: events[4].detectedAt, to: events[2].detectedAt })
      .length,
    0
  );
});
test("连续新增唯一编号，不能通过输入覆盖身份或初始状态", () => {
  const store = newStore();
  for (let i = 0; i < 100; i++) {
    const event = store.createEvent({
      ...input(),
      status: "closed",
      code: "bad",
      id: "bad",
      timeline: ["bad"],
      alertIds: ["bad"],
    });
    assert.equal(event.status, "suspected");
    assert.deepEqual(event.timeline, []);
    assert.deepEqual(event.alertIds, []);
  }
  assert.equal(new Set(store.events.map((e) => e.id)).size, 110);
  assert.equal(new Set(store.events.map((e) => e.code)).size, 110);
  assert.match(store.events.at(-1).code, /^FIRE-\d{8}-\d{3,}$/);
});
test("编辑同步选中详情，保留编号、状态、时间线；取消表单副本不污染", () => {
  const store = newStore();
  const event = store.events[2];
  store.select(event.id);
  const draft = fireInput(event);
  draft.location.address = "更改地址";
  assert.notEqual(event.location.address, draft.location.address);
  store.updateEvent(event.id, { ...draft, title: "修改后", status: "closed", timeline: [] });
  assert.equal(store.selectedEvent.title, "修改后");
  assert.equal(store.selectedEvent.code, event.code);
  assert.equal(store.selectedEvent.status, event.status);
  assert.deepEqual(store.selectedEvent.timeline, event.timeline);
  assert.throws(() => store.updateEvent("missing", draft), /不存在/);
});
test("标题、坐标、日期、置信度及枚举校验失败不部分写入", () => {
  const store = newStore();
  const before = store.events;
  for (const value of [undefined, NaN, Infinity, 181, -181])
    assert.throws(
      () => store.createEvent({ ...input(), location: { ...input().location, longitude: value } }),
      /经度/
    );
  for (const value of [undefined, NaN, Infinity, 86, -86])
    assert.throws(
      () => store.createEvent({ ...input(), location: { ...input().location, latitude: value } }),
      /纬度/
    );
  for (const patch of [
    { title: " " },
    { source: "unknown" },
    { level: "unknown" },
    { detectedAt: "bad" },
    { detectedAt: "2999-01-01T00:00:00Z" },
    { confidence: NaN },
    { confidence: 1.1 },
  ])
    assert.throws(() => store.createEvent({ ...input(), ...patch }));
  assert.equal(store.events, before);
});
test("合法状态链及误报分支原子生成 Timeline 和里程碑时间", () => {
  const store = newStore();
  let event = store.createEvent(input());
  for (const to of [
    "verifying",
    "confirmed",
    "responding",
    "controlled",
    "extinguished",
    "closed",
  ]) {
    const previous = event;
    event = store.transitionStatus(event.id, to, "测试备注");
    const record = event.timeline.at(-1);
    assert.equal(record.fromStatus, previous.status);
    assert.equal(record.toStatus, to);
    assert.equal(record.fireEventId, event.id);
    assert.equal(record.remark, "测试备注");
    assert.ok(record.operator);
  }
  assert.equal(event.timeline.length, 6);
  for (const field of ["confirmedAt", "controlledAt", "extinguishedAt", "closedAt"])
    assert.match(event[field], /Z$/);
  for (const from of ["suspected", "verifying"]) {
    let branch = store.createEvent(input());
    if (from === "verifying") branch = store.transitionStatus(branch.id, "verifying");
    assert.equal(store.transitionStatus(branch.id, "false_alarm").status, "false_alarm");
  }
});
test("穷举八种状态所有非法跳转；重复提交和终态回退无副作用", () => {
  for (const from of Object.keys(fireStatusConfig))
    for (const to of [...Object.keys(fireStatusConfig), "bad"]) {
      if (fireTransitions[from].includes(to)) continue;
      const store = newStore();
      const event = store.events.find((e) => e.status === from);
      const before = store.events;
      assert.throws(() => store.transitionStatus(event.id, to), /不允许/);
      assert.equal(store.events, before);
    }
});
test("编辑发现时间不能晚于首次状态变更，时间线不可单独伪造", () => {
  const store = newStore();
  const event = store.events[2];
  assert.throws(
    () =>
      store.updateEvent(event.id, { ...fireInput(event), detectedAt: new Date().toISOString() }),
    /首次状态变更/
  );
  assert.throws(() => store.addTimeline(event.id, "closed", "绕过"), /不允许/);
});
test("处置记录六种类型、内容和操作人追加，非法输入隔离", () => {
  const store = newStore();
  const event = store.events[0];
  store.select(event.id);
  for (const type of ["verification", "dispatch", "observation", "firefighting", "warning", "note"])
    store.addAction(event.id, type, " 测试内容 ");
  assert.equal(store.selectedEvent.actions.length, 6);
  assert.equal(new Set(store.selectedEvent.actions.map((a) => a.id)).size, 6);
  assert.ok(
    store.selectedEvent.actions.every(
      (a) => a.operator && a.content === "测试内容" && a.fireEventId === event.id
    )
  );
  assert.throws(() => store.addAction(event.id, "note", " "), /必填/);
  assert.throws(() => store.addAction(event.id, "bad", "有效内容"), /类型/);
  assert.equal(store.selectedEvent.status, "suspected");
});
function mountMap(store = newStore(), onPoint) {
  const scope = effectScope();
  const { L } = createLeafletStub();
  const map = L.map(createContainer());
  const drawing = useMapDrawing(onPoint);
  const business = useBusinessLayers();
  const registry = createMapLayerRegistry(map, L.layerGroup, business.publish);
  registerDrawingPanes(map);
  let adapter;
  scope.run(() => {
    adapter = useFireMapLayer(() => drawing.mode.value !== null);
    business.attach(registry, L, { FireEventLayer: adapter.factory(L) });
    drawing.attach(map, L, registry);
    adapter.attach(map, L, registry);
  });
  return {
    store,
    map,
    registry,
    drawing,
    markers: () => registry.get("FireEventLayer").getLayers()[0].getLayers(),
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
test("Fire Marker 全部进入现有图层；状态、等级共同决定符号；Popup 转义", () => {
  const c = mountMap();
  try {
    assert.equal(c.markers().length, 10);
    assert.equal(c.registry.getState("FireEventLayer").featureCount, 10);
    assert.ok(c.markers().every((m) => m.options.pane === "ff-business-FireEventLayer"));
    const marker = c.markers()[0];
    marker.fire("click");
    assert.equal(c.store.selectedEvent.id, c.store.events[0].id);
    assert.match(marker.popup.content, /编号|FIRE-/);
    assert.match(marker.popup.content, /查看详情/);
    assert.doesNotMatch(
      firePopup({ ...c.store.events[0], title: '<img src=x onerror="x">' }),
      /<img/
    );
    const initial = marker.options.icon.html;
    c.store.transitionStatus(c.store.events[0].id, "verifying");
    assert.notEqual(marker.options.icon.html, initial);
    const next = marker.options.icon.html;
    c.store.updateEvent(c.store.events[0].id, {
      ...fireInput(c.store.events[0]),
      level: "critical",
    });
    assert.notEqual(marker.options.icon.html, next);
    assert.match(marker.options.icon.html, new RegExp(fireLevelConfig.critical.icon));
    assert.equal(c.markers()[0], marker);
  } finally {
    c.close();
  }
});
test("地图点绘制回调填充 WGS84 坐标，退出模式后通知，不触发其他绘制", () => {
  const picks = [];
  const c = mountMap(newStore(), (point) => {
    assert.equal(c.drawing.mode.value, null);
    picks.push(point);
  });
  try {
    c.drawing.select("point");
    c.map.fire("click", { latlng: { lat: 30.2, lng: 479.7 } });
    assert.equal(picks.length, 1);
    assert.ok(Math.abs(picks[0].lng - 119.7) < 1e-9);
    c.store.createEvent({
      ...input(),
      location: { longitude: picks[0].lng, latitude: picks[0].lat, address: "" },
    });
    assert.equal(c.markers().length, 11);
    c.drawing.select("polyline");
    c.drawing.cancel();
    assert.equal(picks.length, 1);
  } finally {
    c.close();
  }
});
test("清除 Drawing 不影响火情/UAV 预留/风险资源；显隐与透明度保持", () => {
  const c = mountMap();
  try {
    const fire = c.registry.get("FireEventLayer");
    const risk = c.registry.get("HighRiskLayer");
    c.drawing.select("point");
    c.map.fire("click", { latlng: { lat: 30, lng: 119 } });
    c.registry.hide("FireEventLayer");
    c.registry.setOpacity("FireEventLayer", 0.35);
    c.store.createEvent(input());
    assert.equal(c.map.hasLayer(fire), false);
    c.drawing.clear();
    assert.equal(c.markers().length, 11);
    assert.equal(c.registry.get("HighRiskLayer"), risk);
    c.registry.show("FireEventLayer");
    assert.equal(c.map.getPane("ff-business-FireEventLayer").style.opacity, "0.35");
    assert.ok(c.markers().some((m) => m.options.icon.html.includes(fireStatusConfig.closed.icon)));
  } finally {
    c.close();
  }
});
test("定位在地图挂载后消费，恢复隐藏层；绘制时 Marker 不抢占选中", async () => {
  const store = newStore();
  store.locateEvent(store.events[3].id);
  const c = mountMap(store);
  try {
    assert.deepEqual(c.map.center, [
      store.events[3].location.latitude,
      store.events[3].location.longitude,
    ]);
    assert.equal(store.locateRequest, null);
    c.registry.hide("FireEventLayer");
    c.registry.setOpacity("FireEventLayer", 0);
    store.locateEvent(store.events[0].id);
    assert.equal(c.registry.getState("FireEventLayer").visible, true);
    assert.equal(c.registry.getState("FireEventLayer").opacity, 1);
    c.drawing.select("point");
    await nextTick();
    c.markers()[1].fire("click");
    assert.equal(store.selectedId, store.events[0].id);
    assert.ok(c.markers().every((m) => !m.popup));
  } finally {
    c.close();
  }
});
test("销毁移除监听器，跨页面状态和 closed 标记恢复；会话重置清理选中", () => {
  const store = newStore();
  const c = mountMap(store);
  const marker = c.markers()[0];
  c.close();
  assert.equal(marker.events.size, 0);
  assert.equal(c.map.layers.size, 0);
  store.createEvent(input());
  const next = mountMap(store);
  try {
    assert.equal(next.markers().length, 11);
    assert.equal(useFireEventStore().events.length, 11);
    store.showDetail(store.events[6].id);
    assert.equal(store.selectedEvent.status, "closed");
    store.reset();
    assert.equal(store.events.length, 10);
    assert.equal(store.selectedEvent, null);
    assert.equal(store.detailOpen, false);
    assert.equal(next.markers().length, 10);
    assert.equal(useFireEventStore(createPinia()).events.length, 10);
  } finally {
    next.close();
  }
});
test("火情 Mock 菜单沿用动态结构且冲突不重复；退出和租户切换重置", () => {
  const old = [{ path: "/system" }];
  const routes = withFireMockMenu(old);
  assert.equal(old.length, 1);
  assert.equal(routes[1].component, "Layout");
  assert.equal(routes[1].children[0].component, "fire/index");
  assert.equal(withFireMockMenu(routes), routes);
  const remote = [{ path: "/fire/events" }];
  assert.equal(withFireMockMenu(remote), remote);
  for (const file of ["user", "tenant"])
    assert.match(
      readFileSync(resolve(root, `../../stores/${file}.ts`), "utf8"),
      /useFireEventStore\(store\)\.reset\(\)/
    );
});
