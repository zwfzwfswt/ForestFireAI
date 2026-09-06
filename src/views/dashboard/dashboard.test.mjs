import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createSSRApp } from "vue";
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

test("首页渲染系统名称、五项统计和地图占位，不保留模板业务", async () => {
  const html = await render("index.vue");
  assert.match(html, /森林防火智能监测预警与决策支持系统/);
  assert.match(html, /Mock 演示模式/);
  assert.match(html, /尚未接入 Leaflet/);
  for (const item of dashboardStats) assert.ok(html.includes(item.label));
  assert.doesNotMatch(html, /访问趋势|今日访客|待办事项|GitHub/);
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
