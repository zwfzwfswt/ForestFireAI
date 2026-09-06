import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
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
  source = source.replace(/import ["'][^"']+\.css["'];?/g, "");
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
async function render(file, props = {}) {
  const { default: component } = await import(moduleUrl(resolve(root, file)));
  return renderToString(createSSRApp(component, props));
}
const { dashboardAlerts, dashboardStats } = await import(moduleUrl(resolve(root, "mock.ts")));

test("五项统计与告警口径一致", () => {
  assert.deepEqual(
    dashboardStats.map((item) => item.label),
    ["在线无人机", "今日巡检任务", "疑似火情", "AI告警", "高风险区域"]
  );
  assert.equal(
    dashboardStats[2].value,
    dashboardAlerts.filter((item) => item.status !== "已排除").length
  );
  assert.equal(
    dashboardStats[3].value,
    dashboardAlerts.filter((item) => item.confidence !== null).length
  );
  assert.equal(new Set(dashboardAlerts.map((item) => item.id)).size, dashboardAlerts.length);
  for (const alert of dashboardAlerts) {
    assert.ok(alert.confidence === null || (alert.confidence >= 0 && alert.confidence <= 1));
  }
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
    map: () => map,
    layerGroup: () => ({
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
  let state;
  const { useForestMap } = await import(moduleUrl(resolve(root, "components/map/useForestMap.ts")));
  const app = renderer.createApp({
    setup() {
      state = useForestMap(ref({}));
      return () => null;
    },
  });
  try {
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

test("告警完整展示六项字段，详情使用原生可展开控件且默认折叠", async () => {
  const html = await render("components/DashboardAlerts.vue", { alerts: dashboardAlerts });
  assert.equal((html.match(/<details/g) ?? []).length, dashboardAlerts.length);
  assert.doesNotMatch(html, /<details[^>]*\sopen/);
  for (const alert of dashboardAlerts) {
    for (const text of [
      alert.time,
      alert.type,
      alert.source,
      alert.status,
      alert.description,
      `查看告警 ${alert.id} 详情`,
    ])
      assert.ok(html.includes(text));
  }
  assert.match(html, /96%/);
  assert.match(html, /不适用（人工上报）/);
});

test("空告警显示空状态", async () => {
  const html = await render("components/DashboardAlerts.vue", { alerts: [] });
  assert.match(html, /暂无告警/);
  assert.doesNotMatch(html, /<details/);
});

test("外部文本被转义，不作为 HTML 执行", async () => {
  const html = await render("components/DashboardAlerts.vue", {
    alerts: [{ ...dashboardAlerts[0], description: '<img src=x onerror="alert(1)">' }],
  });
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});
