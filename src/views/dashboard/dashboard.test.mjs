import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { ID_INJECTION_KEY, ZINDEX_INJECTION_KEY } from "element-plus";
import { createSSRApp, createRenderer, ref, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";

// 使用现有 Vue 编译器执行真实 SFC 渲染，无需额外测试依赖。
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  let source = readFileSync(file, "utf8");
  if (file.endsWith(".vue")) {
    if (!source.includes("<script"))
      source += '<script setup lang="ts">const placeholder = true;</script>';
    const { descriptor } = parse(source, { filename: file });
    source = compileScript(descriptor, { id: file, inlineTemplate: true }).content;
  }
  source = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  source = source.replace(/import ["'][^"']+(?:\.css|\/style\/css)["'];?/g, "");
  // 浏览器专属 Leaflet 使用可观测替身验证 Vue 卸载、事件和图层行为。
  source = source.replace(
    'import("leaflet")',
    "Promise.resolve(globalThis.__dashboardLeafletTest)"
  );
  source = source.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
    let target;
    if (specifier.startsWith(".")) {
      const path = resolve(dirname(file), specifier);
      target = moduleUrl(path.endsWith(".vue") ? path : `${path}.ts`);
    } else {
      target = import.meta.resolve(specifier);
    }
    return `from ${JSON.stringify(target)}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url);
  return url;
}
async function render(file, props = {}, pinia = createPinia()) {
  const { default: component } = await import(moduleUrl(resolve(root, file)));
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  return renderToString(
    createSSRApp(component, props)
      .use(pinia)
      .use(router)
      .provide(ID_INJECTION_KEY, { prefix: 100, current: 0 })
      .provide(ZINDEX_INJECTION_KEY, { current: 0 })
  );
}
const { dashboardStats } = await import(moduleUrl(resolve(root, "mock.ts")));
const { useFireAlertStore } = await import(moduleUrl(resolve(root, "../../stores/fireAlert.ts")));

test("Dashboard 使用同一 Alert Store，仅展示最新待处理信号，空值置信度为 --", async () => {
  const pinia = createPinia();
  const store = useFireAlertStore(pinia);
  const html = await render("components/DashboardAlerts.vue", {}, pinia);
  assert.equal((html.match(/class="alert-card"/g) ?? []).length, 5);
  for (const alert of store.dashboardAlerts) assert.ok(html.includes(alert.code));
  for (const alert of store.alerts.filter((alert) =>
    ["confirmed", "rejected", "duplicate"].includes(alert.status)
  ))
    assert.ok(!html.includes(alert.code));
  assert.match(html, /--/);
  const first = store.dashboardAlerts[0];
  store.confirmAlert(first.id, "已核实");
  const next = await render("components/DashboardAlerts.vue", {}, pinia);
  assert.ok(!next.includes(first.code));
  assert.equal((next.match(/class="alert-card"/g) ?? []).length, 5);
});
test("待处理告警清空后显示空状态", async () => {
  const pinia = createPinia();
  const store = useFireAlertStore(pinia);
  for (const alert of [...store.pendingAlerts]) {
    if (alert.status === "new") store.startReview(alert.id);
    store.rejectAlert(alert.id, "测试误报");
  }
  const html = await render("components/DashboardAlerts.vue", {}, pinia);
  assert.match(html, /暂无待处理告警/);
  assert.doesNotMatch(html, /class="alert-card"/);
});
test("告警外部文字转义，不作为 HTML 执行", async () => {
  const pinia = createPinia();
  const store = useFireAlertStore(pinia);
  store.createAlert({
    ...store.alerts[0],
    title: '<img src=x onerror="alert(1)">',
    detectedAt: new Date().toISOString(),
  });
  const html = await render("components/DashboardAlerts.vue", {}, pinia);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});

test("五项统计与告警口径一致", () => {
  assert.deepEqual(
    dashboardStats.map((item) => item.label),
    ["在线无人机", "今日巡检任务", "疑似火情", "AI告警", "高风险区域"]
  );
  const source = readFileSync(resolve(root, "index.vue"), "utf8");
  assert.match(source, /value: alerts.pendingAlerts.length/);
  assert.match(source, /alerts.alerts.filter/);
  assert.doesNotMatch(
    readFileSync(resolve(root, "mock.ts"), "utf8"),
    /dashboardAlerts|DashboardAlert/
  );
});

test("首页渲染系统名称、五项统计和地图容器，不保留模板业务", async () => {
  const html = await render("index.vue");
  assert.match(html, /森林防火智能监测预警与决策支持系统/);
  assert.match(html, /Mock 演示模式/);
  assert.match(html, /GIS 综合态势/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /卫星影像/);
  assert.match(html, /显示底图/);
  assert.doesNotMatch(html, /尚未接入 Leaflet/);
  for (const item of dashboardStats) assert.ok(html.includes(item.label));
  assert.doesNotMatch(html, /访问趋势|今日访客|待办事项|GitHub/);
});

const { createMapSession } = await import(moduleUrl(resolve(root, "components/map/mapSession.ts")));
test("地图会话重复 start 只初始化一次，重复 stop 只销毁一次", async () => {
  let created = 0;
  let disposed = 0;
  const session = createMapSession(
    async () => () => ({ id: ++created }),
    () => disposed++
  );
  await Promise.all([session.start(), session.start()]);
  await session.start();
  assert.equal(created, 1);
  session.stop();
  session.stop();
  assert.equal(disposed, 1);
  await session.start();
  assert.equal(created, 2);
  session.stop();
  assert.equal(disposed, 2);
});

test("快速停用再激活时丢弃迟到结果，不创建旧地图", async () => {
  const completions = [];
  let created = 0;
  const session = createMapSession(
    () => new Promise((resolve) => completions.push(resolve)),
    () => {}
  );
  const first = session.start();
  session.stop();
  const second = session.start();
  completions[1](() => ({ id: ++created }));
  await second;
  completions[0](() => ({ id: ++created }));
  await first;
  assert.equal(created, 1);
  session.stop();
});

test("初始化失败后允许重试", async () => {
  let attempts = 0;
  const session = createMapSession(
    async () => {
      if (++attempts === 1) throw new Error("load failed");
      return () => ({});
    },
    () => {}
  );
  await assert.rejects(session.start(), /load failed/);
  await session.start();
  assert.equal(attempts, 2);
  session.stop();
});

test("坐标显示精度、空鼠标状态和当前缩放", async () => {
  const html = await render("components/map/MapCoordinateDisplay.vue", {
    coordinate: { lng: 119.12345678, lat: 30.12345678 },
    zoom: 12,
  });
  assert.match(html, /119.123457/);
  assert.match(html, /30.123457/);
  assert.match(html, /Zoom：12/);
  const empty = await render("components/map/MapCoordinateDisplay.vue", {
    coordinate: null,
    zoom: 9,
  });
  assert.match(empty, /经度：—/);
  assert.match(empty, /纬度：—/);
});

test("Vue 挂载响应地图事件、切换图层，卸载释放地图和尺寸观察器", async () => {
  const original = {
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let disconnected = 0;
  let removed = 0;
  let layerRemoved = 0;
  let layerListenersRemoved = 0;
  let resized = 0;
  let resizeCallback;
  let animation;
  const events = new Map();
  const tiles = [];
  const map = {
    getPane() {},
    createPane() {
      return { style: {}, remove() {} };
    },
    hasLayer() {
      return true;
    },
    on(name, fn) {
      events.set(name, fn);
      return this;
    },
    off() {
      events.clear();
    },
    remove() {
      removed++;
    },
    getCenter() {
      return { lat: 30, lng: 119 };
    },
    getZoom() {
      return 11;
    },
    invalidateSize() {
      resized++;
    },
    removeLayer() {
      layerRemoved++;
    },
  };
  globalThis.ResizeObserver = class {
    constructor(fn) {
      resizeCallback = fn;
    }
    observe() {}
    disconnect() {
      disconnected++;
    }
  };
  globalThis.requestAnimationFrame = (fn) => {
    animation = fn;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    animation = undefined;
  };
  globalThis.__dashboardLeafletTest = {
    marker: () => ({
      options: {},
      setLatLng() {
        return this;
      },
      setLatLngs() {
        return this;
      },
      setStyle() {
        return this;
      },
      getElement() {},
      addTo() {
        return this;
      },
      on() {
        return this;
      },
      off() {
        return this;
      },
      unbindPopup() {
        return this;
      },
      bindPopup() {
        return this;
      },
      closePopup() {
        return this;
      },
    }),
    divIcon: (options) => options,
    geoJSON: () => ({}),
    map: () => map,
    layerGroup: () => ({
      getLayers() {
        return [];
      },
      addTo() {
        return this;
      },
      addLayer() {
        return this;
      },
      removeLayer() {
        layerRemoved++;
        return this;
      },
      clearLayers() {
        return this;
      },
    }),
    control: { zoom: () => ({ addTo() {} }), scale: () => ({ addTo() {} }) },
    tileLayer(url) {
      tiles.push(url);
      return {
        on() {},
        off() {
          layerListenersRemoved++;
        },
        addTo() {},
      };
    },
  };
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
  globalThis.__dashboardLeafletTest.polygon = globalThis.__dashboardLeafletTest.marker;
  let state;
  const { useForestMap } = await import(moduleUrl(resolve(root, "components/map/useForestMap.ts")));
  const app = renderer.createApp({
    setup() {
      state = useForestMap(ref({}));
      return () => null;
    },
  });
  try {
    app.use(createPinia());
    app.mount({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.ready.value, true);
    assert.match(tiles[0], /openstreetmap/);
    events.get("mousemove")({ latlng: { wrap: () => ({ lat: 31, lng: 118 }) } });
    assert.deepEqual(state.coordinate.value, { lat: 31, lng: 118 });
    events.get("zoomend")();
    assert.equal(state.zoom.value, 11);
    resizeCallback();
    animation();
    assert.equal(resized, 1);
    state.selected.value = "satellite";
    await nextTick();
    assert.match(tiles[1], /World_Imagery/);
    state.visible.value = false;
    await nextTick();
    assert.equal(layerRemoved, 2);
    assert.equal(layerListenersRemoved, 2);
    app.unmount();
    assert.equal(removed, 1);
    assert.equal(disconnected, 1);
    assert.equal(events.size, 0);
    assert.equal(animation, undefined);
    assert.equal(state.ready.value, false);
  } finally {
    Object.assign(globalThis, original);
    delete globalThis.__dashboardLeafletTest;
  }
});
