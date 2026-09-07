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
} from "../../dashboard/components/map/testing/leafletStub.mjs";

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
const { useFireAlertStore } = await load("../../../stores/fireAlert.ts");
const { useFireEventStore } = await load("../../../stores/fireEvent.ts");
const { normalizedAlert, filterAlerts, transitionAlert } = await load("model.ts");
const {
  alertStatusConfig,
  alertTypeConfig,
  alertSourceConfig,
  alertLevelConfig,
  alertConfidence,
  alertTransitions,
  alertSymbolHtml,
} = await load("config.ts");
const { useAlertMapLayer, alertPopup } = await load(
  "../../dashboard/components/map/composables/useAlertMapLayer.ts"
);
const { useBusinessLayers } = await load(
  "../../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { useMapDrawing } = await load("../../dashboard/components/map/composables/useMapDrawing.ts");
const { createMapLayerRegistry } = await load(
  "../../dashboard/components/map/layers/mapLayerRegistry.ts"
);
const { registerDrawingPanes } = await load("../../dashboard/components/map/layers/layerPanes.ts");
const { withFireMockMenu } = await load("../mockMenu.ts");
const setup = () => {
  setActivePinia(createPinia());
  return { store: useFireAlertStore(), events: useFireEventStore() };
};
const query = { keyword: "", type: "", source: "", status: "", level: "", from: "", to: "" };
test("16 条 Mock 完整覆盖类型、来源、状态与等级，3 条双向关联、2 条同一事件重复信号", () => {
  const { store, events } = setup();
  assert.equal(store.alerts.length, 16);
  for (const [field, config] of [
    ["type", alertTypeConfig],
    ["source", alertSourceConfig],
    ["status", alertStatusConfig],
    ["level", alertLevelConfig],
  ])
    assert.deepEqual(new Set(store.alerts.map((a) => a[field])), new Set(Object.keys(config)));
  for (const alert of store.alerts) {
    assert.doesNotThrow(() => normalizedAlert(alert));
    assert.ok(Math.abs(alert.location.longitude - 119.7) < 0.3);
  }
  const linked = store.alerts.filter((a) => a.fireEventId);
  assert.equal(linked.length, 3);
  for (const alert of linked)
    assert.ok(events.events.find((e) => e.id === alert.fireEventId).alertIds.includes(alert.id));
  const duplicates = store.alerts.filter((a) => a.status === "duplicate");
  assert.equal(duplicates.length, 2);
  assert.equal(duplicates[0].duplicateOfFireEventId, duplicates[1].duplicateOfFireEventId);
  for (const alert of duplicates) {
    const target = events.events.find((event) => event.id === alert.duplicateOfFireEventId);
    assert.ok(Math.abs(alert.location.longitude - target.location.longitude) < 0.005);
    assert.ok(Math.abs(alert.location.latitude - target.location.latitude) < 0.005);
  }
});
test("新增编号唯一、身份状态关联字段不受输入覆盖，编辑只允许 new 且副本隔离", () => {
  const { store } = setup();
  const original = store.alerts[0];
  for (let i = 0; i < 100; i++) {
    const added = store.createAlert({ ...original, status: "confirmed", fireEventId: "bad" });
    assert.equal(added.status, "new");
    assert.equal(added.fireEventId, null);
  }
  assert.equal(new Set(store.alerts.map((a) => a.code)).size, 116);
  assert.equal(new Set(store.alerts.map((a) => a.id)).size, 116);
  const updated = store.updateAlert(original.id, {
    ...original,
    title: "编辑",
    status: "confirmed",
    location: { ...original.location, address: "新地址" },
  });
  assert.equal(updated.status, "new");
  assert.equal(updated.code, original.code);
  assert.notEqual(original.location.address, updated.location.address);
  store.startReview(original.id);
  assert.throws(() => store.updateAlert(original.id, original), /不能修改/);
});
test("关键词搜索编号、标题、来源名称、位置；无结果与空查询", () => {
  const { store } = setup();
  assert.equal(filterAlerts(store.alerts, query).length, 16);
  for (const keyword of [
    store.alerts[0].code.toLowerCase(),
    store.alerts[0].title,
    store.alerts[0].location.address,
    store.alerts[0].sourceName,
  ])
    assert.ok(filterAlerts(store.alerts, { ...query, keyword: ` ${keyword} ` }).length);
  assert.equal(filterAlerts(store.alerts, { ...query, keyword: "不存在" }).length, 0);
});
for (const field of ["type", "source", "status", "level"])
  test(`告警 ${field} 筛选`, () => {
    const { store } = setup();
    for (const value of new Set(store.alerts.map((a) => a[field])))
      assert.deepEqual(
        filterAlerts(store.alerts, { ...query, [field]: value }),
        store.alerts.filter((a) => a[field] === value)
      );
  });
test("组合与时间筛选包含端点，逆序范围为空", () => {
  const { store } = setup();
  const alerts = store.alerts;
  assert.equal(
    filterAlerts(alerts, { ...query, from: alerts[2].detectedAt, to: alerts[4].detectedAt }).length,
    3
  );
  assert.equal(
    filterAlerts(alerts, { ...query, from: alerts[4].detectedAt, to: alerts[2].detectedAt }).length,
    0
  );
  assert.equal(
    filterAlerts(alerts, {
      ...query,
      type: alerts[0].type,
      source: alerts[0].source,
      status: "new",
      level: alerts[0].level,
    }).length,
    1
  );
});
test("startReview / confirm 不创建事件，记录研判人时间；状态机拒绝所有非法转换", () => {
  const { store, events } = setup();
  const alert = store.alerts[0];
  store.startReview(alert.id);
  store.confirmAlert(alert.id, "人工核实有效");
  assert.equal(events.events.length, 10);
  assert.equal(store.alerts[0].fireEventId, null);
  assert.equal(store.alerts[0].reviewRemark, "人工核实有效");
  assert.ok(store.alerts[0].reviewedAt && store.alerts[0].reviewer);
  for (const from of Object.keys(alertStatusConfig))
    for (const to of [...Object.keys(alertStatusConfig), "bad"]) {
      if (!alertTransitions[from].includes(to))
        assert.throws(
          () => transitionAlert({ ...alert, status: from }, to, "理由", new Date().toISOString()),
          /不允许/
        );
    }
});
test("驳回和标记重复要求理由及有效事件，失败无部分写入", () => {
  const { store, events } = setup();
  const alert = store.alerts[0];
  store.startReview(alert.id);
  const before = store.alerts;
  assert.throws(() => store.rejectAlert(alert.id, " "), /理由/);
  assert.equal(store.alerts, before);
  assert.throws(() => store.markDuplicate(alert.id, "missing", "重复"), /现有火情/);
  assert.equal(store.alerts, before);
  store.markDuplicate(alert.id, events.events[3].id, "多个来源同一火点");
  assert.equal(store.alerts[0].status, "duplicate");
  assert.equal(store.alerts[0].duplicateOfFireEventId, events.events[3].id);
  assert.equal(store.alerts[0].fireEventId, null);
  store.startReview(store.alerts[1].id);
  store.rejectAlert(store.alerts[1].id, "云雾干扰");
  assert.equal(store.alerts[1].status, "rejected");
});
test("confidence null 保留且显示 --，百分比保留一位，数值/坐标/媒体校验", () => {
  const { store } = setup();
  const input = { ...store.alerts[0], confidence: null };
  assert.equal(store.createAlert(input).confidence, null);
  assert.equal(alertConfidence(null), "--");
  assert.equal(alertConfidence(0.963), "96.3%");
  assert.equal(alertConfidence(0), "0.0%");
  for (const confidence of [NaN, Infinity, -1, 2, undefined])
    assert.throws(() => store.createAlert({ ...input, confidence }));
  for (const patch of [
    { type: "bad" },
    { source: "bad" },
    { level: "bad" },
    { title: " " },
    { location: { longitude: 190, latitude: 30, address: "" } },
    { media: {} },
    { media: { ...input.media, imageUrl: "javascript:alert(1)" } },
  ])
    assert.throws(() => store.createAlert({ ...input, ...patch }));
});
function confirmed() {
  const c = setup();
  const alert = c.store.alerts[0];
  c.store.startReview(alert.id);
  c.store.confirmAlert(alert.id);
  return { ...c, alert: c.store.alerts[0] };
}
test("确认后明确创建 Event：复用统一创建、带入字段、合法状态机确认及双向关联", () => {
  const { store, events, alert } = confirmed();
  const event = store.createFireEventFromAlert(alert.id);
  assert.equal(events.events.length, 11);
  assert.equal(event.status, "confirmed");
  assert.equal(event.timeline.length, 2);
  for (const field of [
    "title",
    "description",
    "location",
    "detectedAt",
    "source",
    "sourceId",
    "sourceName",
    "confidence",
    "level",
  ])
    assert.deepEqual(event[field], alert[field]);
  assert.deepEqual(event.alertIds, [alert.id]);
  assert.equal(store.alerts[0].fireEventId, event.id);
  assert.throws(() => store.createFireEventFromAlert(alert.id), /已经关联/);
  assert.equal(events.events.length, 11);
});
test("关联已有 Event 双向追加但不改变原事件业务信息，重复关联/改绑均拒绝", () => {
  const { store, events, alert } = confirmed();
  const event = events.events[3];
  const linked = store.linkFireEvent(alert.id, event.id);
  assert.equal(linked.alertIds.length, event.alertIds.length + 1);
  assert.equal(linked.title, event.title);
  assert.equal(linked.status, event.status);
  assert.equal(store.alerts[0].fireEventId, event.id);
  assert.throws(() => store.linkFireEvent(alert.id, event.id), /已经关联/);
  assert.throws(() => store.linkFireEvent(alert.id, events.events[2].id), /已经关联/);
});
test("未确认告警不能升级/关联，目标不存在不留下半边关联", () => {
  const { store, events } = setup();
  const eventCount = events.events.length;
  for (const alert of store.alerts.filter((a) => a.status !== "confirmed")) {
    assert.throws(() => store.createFireEventFromAlert(alert.id), /已确认/);
    assert.throws(() => store.linkFireEvent(alert.id, events.events[0].id), /已确认/);
  }
  store.startReview(store.alerts[0].id);
  store.confirmAlert(store.alerts[0].id);
  const before = store.alerts;
  assert.throws(() => store.linkFireEvent(store.alerts[0].id, "missing"), /不存在/);
  assert.equal(store.alerts, before);
  assert.equal(events.events.length, eventCount);
});
test("Dashboard 最新待处理视图复用对象，确认后立即移除；null 置信度不伪造", () => {
  const { store } = setup();
  assert.equal(store.dashboardAlerts.length, 5);
  assert.equal(store.pendingAlerts.length, 10);
  assert.ok(
    store.dashboardAlerts.every(
      (a) => store.alerts.includes(a) && ["new", "reviewing"].includes(a.status)
    )
  );
  const first = store.dashboardAlerts[0];
  store.confirmAlert(first.id);
  assert.ok(!store.dashboardAlerts.some((a) => a.id === first.id));
  assert.equal(store.pendingAlerts.length, 9);
});
function mount(c = setup()) {
  const scope = effectScope();
  const { L } = createLeafletStub();
  const map = L.map(createContainer());
  const drawing = useMapDrawing();
  const business = useBusinessLayers();
  const registry = createMapLayerRegistry(map, L.layerGroup, business.publish);
  registerDrawingPanes(map);
  let adapter;
  scope.run(() => {
    adapter = useAlertMapLayer(() => drawing.mode.value !== null);
    business.attach(registry, L, { FireAlertLayer: adapter.factory(L) });
    drawing.attach(map, L, registry);
    adapter.attach(map, L, registry);
  });
  return {
    ...c,
    map,
    drawing,
    registry,
    markers: () => registry.get("FireAlertLayer").getLayers()[0].getLayers(),
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
test("独立 AlertLayer/pane 创建16 Marker，类型/状态/等级符号不同，Popup安全含关联编号", () => {
  const c = mount();
  try {
    assert.equal(c.markers().length, 16);
    assert.equal(c.registry.getState("FireAlertLayer").zIndex, 810);
    assert.equal(c.registry.getState("FireEventLayer").zIndex, 620);
    assert.ok(c.markers().every((m) => m.options.pane === "ff-business-FireAlertLayer"));
    const alert = c.store.alerts[0];
    const symbol = alertSymbolHtml(alert);
    for (const patch of [{ type: "other" }, { status: "reviewing" }, { level: "critical" }])
      assert.notEqual(alertSymbolHtml({ ...alert, ...patch }), symbol);
    assert.match(symbol, /dashed/);
    assert.match(
      alertPopup({ ...alert, confidence: null }, "FIRE-TEST"),
      /置信度：--.*关联火情：FIRE-TEST/
    );
    assert.doesNotMatch(alertPopup({ ...alert, title: '<img src=x onerror="x">' }), /<img/);
    const marker = c.markers()[0];
    marker.fire("click");
    assert.equal(c.store.selectedId, alert.id);
    c.store.startReview(alert.id);
    assert.equal(c.markers()[0], marker);
  } finally {
    c.close();
  }
});
test("Alert 显隐/透明度与 Drawing、Fire、Risk 隔离，定位消费请求", () => {
  const c = mount();
  try {
    const fire = c.registry.get("FireEventLayer");
    const risk = c.registry.get("HighRiskLayer");
    c.registry.hide("FireAlertLayer");
    c.registry.setOpacity("FireAlertLayer", 0.4);
    assert.equal(c.map.hasLayer(c.registry.get("FireAlertLayer")), false);
    c.registry.show("FireAlertLayer");
    assert.equal(c.map.getPane("ff-business-FireAlertLayer").style.opacity, "0.4");
    c.drawing.select("point");
    c.map.fire("click", { latlng: { lat: 30, lng: 119 } });
    c.drawing.clear();
    assert.equal(c.markers().length, 16);
    assert.equal(c.registry.get("FireEventLayer"), fire);
    assert.equal(c.registry.get("HighRiskLayer"), risk);
    c.registry.hide("FireAlertLayer");
    c.store.locateAlert(c.store.alerts[0].id);
    assert.deepEqual(c.map.center, [
      c.store.alerts[0].location.latitude,
      c.store.alerts[0].location.longitude,
    ]);
    assert.equal(c.store.locateRequest, null);
    assert.equal(c.registry.getState("FireAlertLayer").visible, true);
  } finally {
    c.close();
  }
});
test("绘制时 Marker 不抢选中，销毁清理监听；停用编辑再激活恢复", async () => {
  const c = mount();
  const marker = c.markers()[0];
  c.drawing.select("point");
  await nextTick();
  marker.fire("click");
  assert.equal(c.store.selectedId, null);
  assert.equal(marker.popup, undefined);
  c.close();
  assert.equal(marker.events.size, 0);
  c.store.createAlert(c.store.alerts[0]);
  const next = mount(c);
  try {
    assert.equal(next.markers().length, 17);
  } finally {
    next.close();
  }
});
test("会话重置无悬空关联；Fire Event 单独 reset 同步 Alert；退出/租户入口已接入", () => {
  const { store, events, alert } = confirmed();
  store.createFireEventFromAlert(alert.id);
  store.showDetail(alert.id);
  store.locateAlert(alert.id);
  events.reset();
  assert.equal(store.alerts.length, 16);
  assert.equal(store.selectedAlert, null);
  assert.equal(store.detailOpen, false);
  assert.equal(store.locateRequest, null);
  for (const event of events.events)
    for (const id of event.alertIds)
      assert.equal(store.alerts.find((a) => a.id === id).fireEventId, event.id);
  store.reset();
  assert.equal(
    events.events.reduce((sum, e) => sum + e.alertIds.length, 0),
    3
  );
  for (const file of ["user", "tenant"])
    assert.match(
      readFileSync(resolve(root, `../../../stores/${file}.ts`), "utf8"),
      /useFireAlertStore\(store\)\.reset\(\)/
    );
});
test("告警菜单与事件共用父路由，不覆盖上游或重复注册", () => {
  const routes = withFireMockMenu([]);
  assert.deepEqual(
    routes[0].children.map((item) => item.path),
    ["events", "alerts"]
  );
  assert.equal(routes[0].children[1].component, "fire/alerts/index");
  assert.equal(withFireMockMenu(routes), routes);
});
