import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createRenderer, ref, nextTick, h, KeepAlive, createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { compileScript, parse } from "vue/compiler-sfc";
import ts from "typescript";
import { createContainer, createLeafletStub } from "./testing/leafletStub.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  let source = readFileSync(file, "utf8");
  if (file.endsWith(".vue")) {
    const { descriptor } = parse(source, { filename: file });
    source = compileScript(descriptor, { id: file, inlineTemplate: true }).content;
  }
  source = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace('import("leaflet")', "Promise.resolve(globalThis.__gisLeafletTest)");
  source = source.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
    const path = resolve(dirname(file), specifier);
    const target = specifier.startsWith(".")
      ? moduleUrl(path.endsWith(".vue") ? path : `${path}.ts`)
      : import.meta.resolve(specifier);
    return `from ${JSON.stringify(target)}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url);
  return url;
}
const load = (file) => import(moduleUrl(resolve(root, file)));
const { useMapDrawing } = await load("composables/useMapDrawing.ts");
const { createMapLayerRegistry } = await load("layers/mapLayerRegistry.ts");
const { distance, lineLength, polygonArea, polygonError, formatArea, formatDistance } =
  await load("utils/geometry.ts");
const { mapConfig } = await load("mapConfig.ts");
const { useForestMap } = await load("useForestMap.ts");

function setup() {
  const { L } = createLeafletStub();
  const container = createContainer();
  const map = L.map(container);
  const registry = createMapLayerRegistry(map, L.layerGroup);
  const drawing = useMapDrawing();
  drawing.attach(map, L, registry);
  const emit = (name, lat, lng, detail = 1) =>
    map.fire(name, { latlng: { lat, lng }, originalEvent: { detail } });
  const click = (lat, lng, detail) => emit("click", lat, lng, detail);
  const results = () => [...map.layers].filter((l) => l.kind === "tooltip");
  return { L, container, map, registry, drawing, emit, click, results };
}

test("球面几何已知值、多段求和、顺逆时针、日期线和单位阈值", () => {
  const a = { lat: 0, lng: 0 },
    b = { lat: 0, lng: 1 };
  assert.ok(Math.abs(distance(a, b) - 111194.9266) < 0.01);
  assert.equal(distance(a, a), 0);
  assert.equal(lineLength([a, b, a]), 2 * distance(a, b));
  assert.equal(lineLength([]), 0);
  const square = [a, b, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }];
  assert.ok(Math.abs(polygonArea(square) - 12363683990.26) < 1);
  assert.equal(polygonArea(square), polygonArea([...square].reverse()));
  assert.ok(
    Math.abs(polygonArea(square.map((p) => ({ ...p, lng: p.lng + 179.5 }))) - polygonArea(square)) <
      1
  );
  assert.equal(polygonArea([a, b]), 0);
  assert.equal(formatDistance(999), "999.00 m");
  assert.equal(formatDistance(1000), "1.00 km");
  assert.equal(formatArea(999999), "999999.00 m²");
  assert.equal(formatArea(1000000), "1.00 km²");
});

test("绘制点产生坐标标签且全部挂在 DrawingLayer，完成即退出", () => {
  const { drawing, click, results, registry, map } = setup();
  drawing.select("point");
  assert.match(drawing.status.value, /点击地图绘制点/);
  click(30.1234567, 479.7654321);
  assert.equal(drawing.mode.value, null);
  assert.equal(drawing.count.value, 1);
  assert.match(results()[0].content, /119.765432.*30.123457/);
  assert.equal(registry.get("DrawingLayer").getLayers()[0].getLayers().length, 2);
  assert.equal(map.events.has("click"), false);
  assert.equal(map.doubleClickZoom.enabled(), true);
});

for (const mode of ["polyline", "distance", "polygon", "area"]) {
  test(`${mode} 多节点预览、双击去重、显示结果并退出`, () => {
    const { drawing, click, emit, map, results } = setup();
    drawing.select(mode);
    click(30, 119);
    click(30, 119.01);
    emit("mousemove", 30.01, 119.01);
    const shape = [...map.layers].find((l) => l.kind === "polyline" || l.kind === "polygon");
    assert.equal(shape.coordinates.length, 3);
    assert.match(drawing.status.value, /继续点击添加节点/);
    click(30.01, 119.01);
    click(30.01, 119.01, 2);
    emit("mousemove", 31, 120);
    emit("dblclick", 30.01, 119.01, 2);
    assert.equal(shape.coordinates.length, 3, "结束时移除鼠标预览点");
    assert.equal(drawing.count.value, 1);
    assert.equal(drawing.mode.value, null);
    assert.match(
      results()[0].content,
      mode === "area" || mode === "polygon" ? /面积.*m²/ : /总(?:长度|距离).*km/
    );
    click(32, 120);
    assert.equal(drawing.count.value, 1, "退出后点击不再绘制");
  });
}

test("节点不足、重复节点、无效坐标和自交区域不生成结果", () => {
  const { drawing, click, results } = setup();
  drawing.select("area");
  click(NaN, 119);
  click(90, 119);
  drawing.finish();
  assert.match(drawing.status.value, /至少需要 3/);
  click(30, 119);
  click(30, 119);
  assert.equal(drawing.canFinish.value, false);
  click(31, 120);
  click(31, 119);
  click(30, 120);
  drawing.finish();
  assert.match(drawing.status.value, /自交/);
  assert.equal(results().length, 0);
  assert.equal(drawing.mode.value, "area");
  assert.match(
    polygonError([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]),
    /共线/
  );
});

test("测距允许往返路径，Enter 完成后总距离包含往返两段", () => {
  const { drawing, click, container, results } = setup();
  drawing.select("distance");
  click(0, 0);
  click(0, 0.001);
  click(0, 0);
  container.keys.get("keydown")({ key: "Enter", preventDefault() {} });
  assert.equal(drawing.mode.value, null);
  assert.match(results()[0].content, /总距离 222.39 m/);
});

test("活动草稿清除、隐藏和日期线区域绘制", () => {
  const { drawing, click, registry, results, map } = setup();
  drawing.select("distance");
  click(30, 119);
  drawing.clear();
  assert.equal(drawing.mode.value, null);
  assert.equal(registry.get("DrawingLayer").getLayers().length, 0);
  drawing.select("area");
  click(30, 119);
  drawing.hide();
  assert.equal(drawing.mode.value, null);
  assert.equal(map.hasLayer(registry.get("DrawingLayer")), false);
  drawing.select("polygon");
  assert.equal(drawing.visible.value, true);
  click(0, 179.9);
  click(0, -179.9);
  click(0.1, -179.9);
  click(0.1, 179.9);
  drawing.finish();
  assert.equal(drawing.count.value, 1);
  assert.match(results()[0].content, /面积.*km²/);
  const shape = [...map.layers].find((layer) => layer.kind === "polygon");
  assert.ok(
    shape.coordinates.every((point) => point[1] >= 179.9 - 1e-9 && point[1] <= 180.1 + 1e-9)
  );
});

test("工具互斥、切换取消草稿并保留结果，Esc 释放监听器并恢复原交互", () => {
  const { drawing, click, map, container, results, registry } = setup();
  const business = () => {};
  map.on("mousemove", business);
  drawing.select("point");
  click(30, 119);
  drawing.select("distance");
  click(30, 119);
  drawing.select("area");
  assert.equal(drawing.mode.value, "area");
  assert.equal(map.events.get("click").size, 1);
  assert.equal(registry.get("DrawingLayer").getLayers().length, 2);
  assert.equal(results().length, 1);
  assert.equal(map.doubleClickZoom.enabled(), false);
  container.keys.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(drawing.mode.value, null);
  assert.equal(container.keys.size, 0);
  assert.equal(container.style.cursor, "grab");
  assert.equal(map.events.get("mousemove").size, 1);
  assert.equal(map.doubleClickZoom.enabled(), true);
  map.doubleClickZoom.disable();
  drawing.select("distance");
  drawing.cancel();
  assert.equal(map.doubleClickZoom.enabled(), false);
});

test("DrawingLayer show/hide/clear 含标签整体生效，保留底图与所有业务组", () => {
  const { drawing, click, map, registry, L, results } = setup();
  const ids = [
    "BaseMapLayer",
    "UAVLayer",
    "UAVTrackLayer",
    "MissionLayer",
    "FireEventLayer",
    "RemoteSensingLayer",
    "FireRiskLayer",
    "ResourceLayer",
  ];
  const others = ids.map((id) => {
    assert.equal(registry.get(id), undefined, "业务组按需创建");
    const group = registry.register(id);
    assert.equal(registry.register(id), group);
    const layer = L.circleMarker([30, 119]).addTo(group);
    return { group, layer };
  });
  drawing.select("point");
  click(30, 119);
  const label = results()[0];
  drawing.hide();
  assert.equal(map.hasLayer(label), false);
  drawing.show();
  assert.equal(map.hasLayer(label), true);
  assert.equal(drawing.status.value, "临时绘制已显示");
  drawing.hide();
  drawing.clear();
  drawing.show();
  assert.equal(registry.get("DrawingLayer").getLayers().length, 0);
  assert.equal(map.hasLayer(label), false);
  assert.equal(drawing.count.value, 0);
  for (const { group, layer } of others) {
    assert.equal(map.hasLayer(group), true);
    assert.equal(map.hasLayer(layer), true);
    assert.equal(group.getLayers().length, 1);
  }
});

test("取消、再次选择当前工具和 detach 不产生结果或残留资源", () => {
  const { drawing, click, map, container, registry, L } = setup();
  drawing.select("distance");
  click(30, 119);
  drawing.select("distance");
  assert.equal(drawing.mode.value, null);
  drawing.select("area");
  click(30, 119);
  drawing.detach();
  drawing.detach();
  assert.equal(map.events.size, 0);
  assert.equal(container.keys.size, 0);
  assert.equal(registry.get("DrawingLayer").getLayers().length, 0);
  drawing.select("point");
  assert.equal(drawing.mode.value, null);
  drawing.attach(map, L, registry);
  drawing.select("point");
  click(30, 119);
  assert.equal(drawing.count.value, 1);
});

test("工具栏真实 SFC 渲染所有工具、互斥选中态、禁用态和状态文本", async () => {
  const { default: toolbar } = await load("MapToolbar.vue");
  const props = {
    ready: true,
    mode: "distance",
    status: "点击地图开始测距",
    count: 2,
    visible: true,
    canFinish: false,
  };
  const html = await renderToString(createSSRApp(toolbar, props));
  for (const text of [
    "绘制点",
    "绘制折线",
    "绘制多边形",
    "测距",
    "测面积",
    "清除临时绘制",
    "回到默认视角",
    "点击地图开始测距",
  ])
    assert.ok(html.includes(text));
  assert.match(html, /aria-pressed="true"[^>]*>测距/);
  assert.match(html, /disabled[^>]*>完成/);
  const disabled = await renderToString(createSSRApp(toolbar, { ...props, ready: false }));
  assert.equal((disabled.match(/ disabled/g) ?? []).length, 10);
});

test("Vue KeepAlive 停用销毁、激活重建 GIS；默认视角读取 mapConfig", async () => {
  const original = {
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const { L, maps } = createLeafletStub();
  let disconnected = 0;
  globalThis.__gisLeafletTest = L;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {
      disconnected++;
    }
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    createElement: () => ({}),
    createText: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null,
    patchProp() {},
  });
  const active = ref(true);
  let state;
  const Page = {
    setup() {
      state = useForestMap(ref(createContainer()));
      return () => null;
    },
  };
  const app = renderer.createApp({
    setup: () => () => h(KeepAlive, null, { default: () => (active.value ? h(Page) : null) }),
  });
  const flush = async () => {
    await nextTick();
    await new Promise((resolve) => setImmediate(resolve));
  };
  try {
    app.mount({});
    await flush();
    assert.equal(maps.length, 1);
    state.drawing.select("distance");
    maps[0].fire("click", { latlng: { lat: 30, lng: 119 } });
    maps[0].setView([31, 120], 12);
    state.resetView();
    assert.deepEqual(maps[0].center, mapConfig.center);
    assert.equal(maps[0].zoom, mapConfig.zoom);
    assert.equal(state.drawing.mode.value, null);
    state.drawing.select("point");
    maps[0].fire("click", { latlng: { lat: 30, lng: 119 } });
    state.drawing.select("area");
    active.value = false;
    await flush();
    assert.equal(maps[0].removed, true);
    assert.equal(maps[0].events.size, 0);
    assert.equal(maps[0].layers.size, 0);
    assert.equal(maps[0].getContainer().keys.size, 0);
    assert.equal(state.ready.value, false);
    active.value = true;
    await flush();
    assert.equal(maps.length, 2);
    assert.equal(state.ready.value, true);
    assert.equal(state.drawing.count.value, 0);
    state.drawing.select("point");
    maps[1].fire("click", { latlng: { lat: 31, lng: 120 } });
    assert.equal(state.drawing.count.value, 1);
    app.unmount();
    assert.equal(maps[1].removed, true);
    assert.equal(maps[1].events.size, 0);
    assert.equal(disconnected, 2);
  } finally {
    app.unmount();
    Object.assign(globalThis, original);
    delete globalThis.__gisLeafletTest;
  }
});
