import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
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
const { useRemoteSensingStore } = await load("../../stores/remoteSensing.ts");
const { useSatelliteHotspotStore } = await load("../../stores/satelliteHotspot.ts");
const { useFireRiskStore } = await load("../../stores/fireRisk.ts");
const { useFireAlertStore } = await load("../../stores/fireAlert.ts");
const { useFireEventStore } = await load("../../stores/fireEvent.ts");
const {
  filterScenes,
  filterProducts,
  filterHotspots,
  emptyCatalogQuery,
  emptyHotspotQuery,
  leafletBounds,
} = await load("model.ts");
const { productConfig, riskLevels, confidenceText, optionalValue } = await load("config.ts");
const { hotspotPopup, riskPopup } = await load("mapPopups.ts");
const { withRemoteSensingMockMenu } = await load("mockMenu.ts");
const { useRemoteSensingLayers } = await load(
  "../dashboard/components/map/composables/useRemoteSensingLayers.ts"
);
const { useBusinessLayers } = await load(
  "../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { createMapLayerRegistry } = await load(
  "../dashboard/components/map/layers/mapLayerRegistry.ts"
);
function setup() {
  setActivePinia(createPinia());
  return {
    catalog: useRemoteSensingStore(),
    hot: useSatelliteHotspotStore(),
    risk: useFireRiskStore(),
    alerts: useFireAlertStore(),
    events: useFireEventStore(),
  };
}
function mapSetup(isDrawing = () => false) {
  const stores = setup(),
    { L } = createLeafletStub(),
    map = L.map(createContainer());
  const scope = effectScope();
  const adapter = scope.run(() => useRemoteSensingLayers(isDrawing));
  const business = useBusinessLayers(),
    registry = createMapLayerRegistry(map, L.layerGroup, business.publish);
  const factories = Object.fromEntries(
    ["RemoteSensingLayer", "FireRiskLayer", "SatelliteHotspotLayer"].map((id) => [
      id,
      adapter.factory(L, id),
    ])
  );
  business.attach(registry, L, factories);
  adapter.attach(map, L, registry);
  const cleanup = () => {
    adapter.detach();
    scope.stop();
    registry.dispose();
  };
  const members = (id) => registry.get(id).getLayers()[0].getLayers();
  return { ...stores, adapter, business, registry, map, L, cleanup, members };
}
test("Mock 8 scenes / 12 products / 15 hotspots / 8 zones，覆盖时间、类型和风险", () => {
  const { catalog, hot, risk } = setup();
  assert.equal(catalog.scenes.length, 8);
  assert.equal(catalog.products.length, 12);
  assert.equal(hot.hotspots.length, 15);
  assert.equal(risk.riskZones.length, 8);
  assert.equal(new Set(catalog.products.map((p) => p.type)).size, 8);
  assert.equal(new Set(catalog.scenes.map((s) => s.acquiredAt)).size, 8);
  assert.deepEqual(new Set(risk.riskZones.map((z) => z.level)), new Set(Object.keys(riskLevels)));
  for (const z of risk.riskZones) {
    assert.ok(z.score >= 0 && z.score <= 100);
    for (const factor of Object.values(z.factors))
      assert.ok(factor.score >= 0 && factor.score <= 100);
    assert.deepEqual(z.geometry.coordinates[0][0], z.geometry.coordinates[0].at(-1));
  }
});
test("Scene 搜索、卫星、传感器、云量、日期、状态组合筛选", () => {
  const { catalog } = setup(),
    q = emptyCatalogQuery();
  assert.equal(filterScenes(catalog.scenes, q).length, 8);
  for (const field of ["satellite", "sensor", "status"]) {
    const value = catalog.scenes[0][field];
    assert.ok(
      filterScenes(catalog.scenes, { ...q, [field]: value }).every((s) => s[field] === value)
    );
  }
  assert.equal(filterScenes(catalog.scenes, { ...q, keyword: "01", maxCloud: 0 }).length, 1);
  const day = catalog.scenes[2].acquiredAt;
  assert.equal(filterScenes(catalog.scenes, { ...q, from: day, to: day }).length, 1);
  assert.equal(
    filterScenes(catalog.scenes, { ...q, from: catalog.scenes[7].acquiredAt, to: day }).length,
    0
  );
});
test("Product 类型、日期、状态、关键词筛选", () => {
  const { catalog } = setup(),
    q = emptyCatalogQuery();
  for (const type of Object.keys(productConfig))
    assert.ok(filterProducts(catalog.products, { ...q, type }).every((p) => p.type === type));
  assert.equal(filterProducts(catalog.products, { ...q, status: "failed" }).length, 1);
  assert.equal(filterProducts(catalog.products, { ...q, keyword: "no-match" }).length, 0);
  const time = catalog.products[3].generatedAt;
  assert.ok(
    filterProducts(catalog.products, { ...q, from: time, to: time }).every(
      (p) => p.generatedAt === time
    )
  );
});
test("产品就绪检查、透明度边界、选择与重置", () => {
  const { catalog } = setup();
  assert.throws(() => catalog.toggle("product-11", true), /不可显示/);
  for (const value of [-1, 2, NaN, Infinity])
    assert.throws(() => catalog.setOpacity("product-1", value));
  assert.throws(() => catalog.toggle("missing"));
  catalog.locate("product", "product-2");
  assert.equal(catalog.selectedProduct.type, "ndvi");
  catalog.selectScene("scene-1");
  assert.ok(catalog.selectedScene);
  catalog.reset();
  assert.equal(catalog.selectedProduct, null);
  assert.equal(catalog.locateRequest, null);
  assert.ok(catalog.products.every((p) => !p.visible));
});
test("八种本地 Mock 图像可用且显式标记，图例配置与产品一致", () => {
  const { catalog } = setup();
  for (const p of catalog.products) {
    assert.deepEqual(p.legend, productConfig[p.type].legend);
    const svg = readFileSync(resolve(root, "../../../public" + p.rasterUrl), "utf8");
    assert.match(svg, /MOCK \/ DEMO/);
    assert.match(svg, /NO SATELLITE DATA/);
    assert.ok(!svg.includes('href="http'));
  }
  assert.notDeepEqual(productConfig.ndvi.legend, productConfig.lst.legend);
  assert.equal(productConfig.fire_risk.legend.stops.length, 5);
});
test("Hotspot 筛选与空置信度/FRP：不是伪造的零", () => {
  const { hot } = setup(),
    q = emptyHotspotQuery();
  assert.equal(confidenceText(null), "--");
  assert.equal(optionalValue(null), "--");
  assert.equal(optionalValue(0), "0.0");
  assert.equal(filterHotspots(hot.hotspots, { ...q, source: "viirs" }).length, 5);
  assert.ok(
    filterHotspots(hot.hotspots, { ...q, confidence: "unknown" }).every(
      (h) => h.confidence === null
    )
  );
  assert.ok(
    filterHotspots(hot.hotspots, { ...q, confidence: "high" }).every((h) => h.confidence >= 0.8)
  );
  assert.match(hotspotPopup(hot.hotspots[0]), /FRP：--/);
});
test("3 个 Hotspot 明确生成 Alert，字段继承、去重、不自动生成 Event", () => {
  const { hot, alerts, events } = setup(),
    count = events.events.length;
  for (const h of hot.hotspots.slice(0, 3)) {
    const alert = hot.generateAlert(h.id);
    assert.equal(alert.type, "satellite_hotspot");
    assert.equal(alert.source, "satellite");
    assert.equal(alert.confidence, h.confidence);
    assert.equal(alert.location.longitude, h.longitude);
    assert.equal(alert.detectedAt, h.detectedAt);
    assert.equal(hot.generateAlert(h.id).id, alert.id);
    assert.equal(hot.hotspots.find((s) => s.id === h.id).alertId, alert.id);
  }
  assert.equal(alerts.alerts.length, 19);
  assert.equal(events.events.length, count);
  assert.equal(filterHotspots(hot.hotspots, { ...emptyHotspotQuery(), alert: "yes" }).length, 3);
});
test("人工研判后事件关联同步，告警重置无悬空关联", () => {
  const { hot, alerts } = setup();
  const alert = hot.generateAlert("hotspot-1");
  alerts.startReview(alert.id);
  alerts.confirmAlert(alert.id);
  const event = alerts.createFireEventFromAlert(alert.id);
  assert.equal(hot.hotspots[0].fireEventId, event.id);
  assert.equal(filterHotspots(hot.hotspots, { ...emptyHotspotQuery(), event: "yes" }).length, 1);
  alerts.reset();
  assert.equal(hot.hotspots[0].alertId, null);
  assert.equal(hot.hotspots[0].fireEventId, null);
});
test("风险统计仅 high/very_high/extreme，空集更新与重置", () => {
  const { risk } = setup();
  assert.equal(risk.highRiskCount, 4);
  risk.riskZones = [];
  assert.equal(risk.highRiskCount, 0);
  risk.reset();
  assert.equal(risk.highRiskCount, 4);
  const dashboard = readFileSync(resolve(root, "../dashboard/index.vue"), "utf8");
  assert.match(dashboard, /value: risks.highRiskCount/);
});
test("Registry 三个独立组、pane 顺序不改变已有图层", () => {
  const m = mapSetup();
  try {
    assert.equal(m.registry.getState("RemoteSensingLayer").zIndex, 300);
    assert.equal(m.registry.getState("FireRiskLayer").zIndex, 310);
    assert.equal(m.registry.getState("SatelliteHotspotLayer").zIndex, 600);
    assert.equal(m.registry.getState("FireEventLayer").zIndex, 620);
    assert.equal(m.members("FireRiskLayer").length, 8);
    assert.equal(m.members("SatelliteHotspotLayer").length, 15);
  } finally {
    m.cleanup();
  }
});
test("Raster 注册显隐、0–1透明度立即更新；已有实例复用", () => {
  const m = mapSetup();
  try {
    m.catalog.toggle("product-2", true);
    const overlay = m.members("RemoteSensingLayer")[0];
    assert.equal(overlay.kind, "image");
    assert.equal(overlay.options.pane, "ff-business-RemoteSensingLayer");
    m.catalog.setOpacity("product-2", 0.2);
    assert.equal(m.members("RemoteSensingLayer")[0], overlay);
    assert.equal(overlay.options.opacity, 0.2);
    m.registry.hide("RemoteSensingLayer");
    assert.ok(!m.map.hasLayer(overlay));
    m.registry.show("RemoteSensingLayer");
    assert.ok(m.map.hasLayer(overlay));
    m.registry.setOpacity("RemoteSensingLayer", 0.5);
    assert.equal(m.map.panes.get("ff-business-RemoteSensingLayer").style.opacity, "0.5");
    m.catalog.toggle("product-2", false);
    assert.equal(m.members("RemoteSensingLayer").length, 0);
    assert.equal(overlay.events.size, 0);
    m.catalog.toggle("product-8", true);
    assert.equal(m.members("FireRiskLayer").filter((x) => x.kind === "image").length, 1);
    assert.equal(m.members("RemoteSensingLayer").length, 0);
  } finally {
    m.cleanup();
  }
});
test("Raster 错误有提示、隐藏清理、重置无遗留影像", () => {
  const m = mapSetup();
  try {
    m.catalog.toggle("product-1", true);
    const overlay = m.members("RemoteSensingLayer")[0];
    overlay.fire("error");
    assert.ok(m.adapter.errors.value["product-1"]);
    overlay.fire("load");
    assert.equal(Object.keys(m.adapter.errors.value).length, 0);
    m.catalog.reset();
    assert.equal(m.members("RemoteSensingLayer").length, 0);
    assert.equal(overlay.events.size, 0);
  } finally {
    m.cleanup();
  }
});
test("卫星 Marker 复用，显隐、定位与最新关联 Popup", () => {
  const m = mapSetup();
  try {
    const marker = m.members("SatelliteHotspotLayer")[0];
    const alert = m.hot.generateAlert("hotspot-1");
    assert.equal(m.members("SatelliteHotspotLayer")[0], marker);
    assert.match(marker.popup.content, new RegExp(alert.id));
    m.registry.hide("SatelliteHotspotLayer");
    assert.ok(!m.map.hasLayer(marker));
    m.hot.locate("hotspot-1");
    assert.ok(m.map.hasLayer(marker));
    assert.deepEqual(m.map.center, [m.hot.hotspots[0].latitude, m.hot.hotspots[0].longitude]);
    assert.equal(m.hot.locateRequest, null);
  } finally {
    m.cleanup();
  }
});
test("风险等级样式、Popup 主因子、整组透明度与定位", () => {
  const m = mapSetup();
  try {
    const polygons = m.members("FireRiskLayer");
    polygons.forEach((p, i) => {
      assert.equal(p.options.color, riskLevels[m.risk.riskZones[i].level].color);
      assert.match(p.popup.content, /MOCK/);
      assert.match(p.popup.content, /水分/);
    });
    m.registry.hide("FireRiskLayer");
    assert.ok(!m.map.hasLayer(polygons[0]));
    m.registry.setOpacity("FireRiskLayer", 0);
    m.risk.locate("risk-1");
    assert.equal(m.registry.getState("FireRiskLayer").opacity, 1);
    assert.ok(m.map.hasLayer(polygons[0]));
    assert.ok(polygons[0].popupOpen);
    assert.ok(!riskPopup({ ...m.risk.riskZones[0], name: "<img src=x>" }).includes("<img"));
  } finally {
    m.cleanup();
  }
});
test("Scene / Product 定位按覆盖范围，Drawing 清除不影响新旧业务", () => {
  const m = mapSetup();
  try {
    m.catalog.locate("scene", "scene-1");
    assert.deepEqual(m.map.bounds, leafletBounds(m.catalog.scenes[0].bbox));
    m.catalog.locate("product", "product-2");
    const before = m.registry.list();
    const drawing = m.registry.register("DrawingLayer");
    m.L.circleMarker([30, 119], {}).addTo(drawing);
    m.registry.clear("DrawingLayer");
    assert.equal(drawing.getLayers().length, 0);
    assert.deepEqual(m.registry.list(), before);
    assert.equal(m.members("RemoteSensingLayer").length, 1);
    assert.equal(m.members("SatelliteHotspotLayer").length, 15);
    assert.equal(m.members("FireRiskLayer").length, 8);
  } finally {
    m.cleanup();
  }
});
test("detach 移除订阅与事件，重新挂载无重复层", () => {
  const m = mapSetup();
  m.catalog.toggle("product-2", true);
  const old = m.members("SatelliteHotspotLayer")[0];
  m.adapter.detach();
  m.business.detach();
  m.registry.dispose();
  assert.equal(old.events.size, 0);
  assert.equal(m.map.layers.size, 0);
  m.catalog.setOpacity("product-2", 0.35);
  const registry = createMapLayerRegistry(m.map, m.L.layerGroup);
  const factories = Object.fromEntries(
    ["RemoteSensingLayer", "FireRiskLayer", "SatelliteHotspotLayer"].map((id) => [
      id,
      m.adapter.factory(m.L, id),
    ])
  );
  m.business.attach(registry, m.L, factories);
  m.adapter.attach(m.map, m.L, registry);
  assert.equal(registry.get("SatelliteHotspotLayer").getLayers()[0].getLayers().length, 15);
  assert.equal(registry.get("RemoteSensingLayer").getLayers()[0].getLayers().length, 1);
  m.adapter.detach();
  registry.dispose();
  m.cleanup();
});
test("动态菜单四路由，已存在菜单保留，组件路径存在", () => {
  const routes = withRemoteSensingMockMenu([]);
  assert.equal(routes[0].children.length, 4);
  assert.equal(withRemoteSensingMockMenu(routes), routes);
  for (const child of routes[0].children)
    assert.ok(
      readFileSync(resolve(root, "..", `${child.component}.vue`), "utf8").includes("defineOptions")
    );
  const permission = readFileSync(resolve(root, "../../stores/permission.ts"), "utf8");
  assert.match(permission, /withRemoteSensingMockMenu\(withFireMockMenu/);
  for (const file of ["user.ts", "tenant.ts"]) {
    const text = readFileSync(resolve(root, "../../stores", file), "utf8");
    for (const store of ["useRemoteSensingStore", "useSatelliteHotspotStore", "useFireRiskStore"])
      assert.ok(text.includes(`${store}(store).reset()`));
  }
});
test("绘制时热点与风险面不抢选中/Popup，退出后恢复", () => {
  const drawing = ref(false),
    m = mapSetup(() => drawing.value);
  try {
    const marker = m.members("SatelliteHotspotLayer")[0],
      polygon = m.members("FireRiskLayer")[0];
    drawing.value = true;
    marker.fire("click");
    polygon.fire("click");
    assert.equal(m.hot.selectedHotspot, null);
    assert.equal(m.risk.selectedRiskZone, null);
    assert.equal(marker.popup, undefined);
    assert.equal(polygon.popup, undefined);
    drawing.value = false;
    marker.fire("click");
    polygon.fire("click");
    assert.equal(m.hot.selectedHotspot.id, "hotspot-1");
    assert.equal(m.risk.selectedRiskZone.id, "risk-1");
    assert.ok(marker.popup && polygon.popup);
  } finally {
    m.cleanup();
  }
});
test("空产品目录清理跨两组影像，风险分区删除无残留监听", () => {
  const m = mapSetup();
  try {
    m.catalog.toggle("product-1", true);
    m.catalog.toggle("product-8", true);
    const polygon = m.members("FireRiskLayer").find((layer) => layer.kind === "polygon");
    m.catalog.products = [];
    assert.equal(m.members("RemoteSensingLayer").length, 0);
    assert.equal(m.members("FireRiskLayer").filter((layer) => layer.kind === "image").length, 0);
    m.risk.riskZones = [];
    assert.equal(m.members("FireRiskLayer").length, 0);
    assert.equal(polygon.events.size, 0);
  } finally {
    m.cleanup();
  }
});
test("Mock 产品图例副本隔离，生成时间不早于来源影像", () => {
  const { catalog } = setup();
  for (const p of catalog.products)
    assert.ok(
      Date.parse(p.generatedAt) >=
        Date.parse(catalog.scenes.find((s) => s.id === p.sceneId).acquiredAt)
    );
  catalog.products[0].legend.stops[0].label = "changed";
  catalog.reset();
  assert.notEqual(catalog.products[0].legend.stops[0].label, "changed");
  assert.notEqual(productConfig.rgb.legend.stops[0].label, "changed");
});
