import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

// 仅使用现有 Vite/Vue 和本机 Chromium。独立页面不加载认证、业务 API 或外部瓦片。
// GIS_BROWSER 可指定 Chrome/Edge 可执行文件；没有本机浏览器时明确跳过。
const browser =
  process.env.GIS_BROWSER ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].find(existsSync);

async function browserChecks() {
  const { nextTick, active } = window.gisHarness;
  const passed = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("等待地图状态超时");
  };
  const state = () => document.querySelector(".forest-map").__vueParentComponent.setupState;
  const labels = () => [...document.querySelectorAll(".gis-result")];
  const button = async (text) => {
    const target = [...document.querySelectorAll(".gis-tools button")].find((b) =>
      b.textContent.includes(text)
    );
    check(target && !target.disabled, `按钮不可用：${text}`);
    target.click();
    await nextTick();
  };
  const mouse = async (type, x, y, detail = 1) => {
    const target = document.querySelector(".forest-map__canvas");
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        detail,
        button: 0,
      })
    );
    await nextTick();
  };
  try {
    await waitFor(() => document.querySelector(".forest-map") && state().ready);
    await button("绘制点");
    await mouse("click", 140, 120);
    check(labels().length === 1 && /经度.*纬度/.test(labels()[0].textContent), "点坐标标签缺失");
    check(state().mode === null, "点绘制未退出");
    passed.push("点绘制与经纬度");
    for (const tool of ["绘制折线", "绘制多边形", "测距", "测面积"]) {
      const previous = labels().length;
      await button(tool);
      await mouse("click", 180, 120);
      await mouse("click", 260, 120);
      await mouse("mousemove", 260, 220);
      check(/继续点击/.test(state().status), "预览状态缺失");
      await mouse("click", 260, 220);
      await mouse("click", 260, 220, 2);
      await mouse("dblclick", 260, 220, 2);
      check(labels().length === previous + 1, `${tool} 未生成标签`);
      check(state().mode === null, `${tool} 未退出模式`);
      check(state().zoom === 9, "结束绘制意外触发双击缩放");
      check(
        /面积/.test(labels().at(-1).textContent) === ["绘制多边形", "测面积"].includes(tool),
        "结果类型错误"
      );
      passed.push(tool);
    }
    const count = labels().length;
    await button("测距");
    await mouse("click", 160, 130);
    await button("测面积");
    check(state().mode === "area" && labels().length === count, "工具互斥失败");
    await button("取消");
    passed.push("工具互斥和取消");
    await button("隐藏绘制");
    await waitFor(() => labels().length === 0);
    check(
      labels().length === 0 && !document.querySelector(".leaflet-overlay-pane path"),
      "隐藏后残留图形/标签"
    );
    await button("显示绘制");
    check(labels().length === count, "显示后结果未恢复");
    const tiles = document.querySelector(".leaflet-tile-pane").childElementCount;
    await button("清除临时绘制");
    await waitFor(() => labels().length === 0);
    check(
      labels().length === 0 && !document.querySelector(".leaflet-overlay-pane path"),
      "清除后残留图形/标签"
    );
    check(document.querySelector(".leaflet-tile-pane").childElementCount === tiles, "清除误删底图");
    passed.push("DrawingLayer 显示、隐藏、清除与底图隔离");
    document.querySelector(".leaflet-control-zoom-in").click();
    await waitFor(() => state().zoom === 10);
    await button("回到默认视角");
    await waitFor(() => state().zoom === 9);
    passed.push("回到默认视角");
    await button("测距");
    await mouse("click", 140, 120);
    active.value = false;
    await nextTick();
    check(!document.querySelector(".leaflet-container"), "停用后地图仍在页面");
    active.value = true;
    await nextTick();
    await waitFor(() => state().ready);
    check(state().mode === null && state().count === 0, "重新激活残留工具/结果");
    await button("绘制点");
    await mouse("click", 140, 120);
    check(labels().length === 1, "重新初始化后无法绘制");
    passed.push("Dashboard 停用重建后绘制");
    document.querySelector("#app").style.width = "440px";
    await nextTick();
    const toolbar = document.querySelector(".gis-tools");
    check(toolbar.scrollWidth <= toolbar.clientWidth, "窄容器工具栏横向溢出");
    passed.push("窄容器工具栏换行");
    return { passed };
  } catch (error) {
    return {
      passed,
      error: error.message,
      mapError: document.querySelector(".forest-map__message")?.textContent,
    };
  }
}

test("Chromium 真实 Vue/Leaflet GIS 工具烟雾验证", { skip: !browser, timeout: 60000 }, async () => {
  const profile = mkdtempSync(join(tmpdir(), "forestfire-gis-browser-"));
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [vue()],
    logLevel: "error",
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: ["vue", "leaflet"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  let child;
  try {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== "/__gis_test__.html") return next();
      const html = `<!doctype html><html><head><style>
      :root { --el-bg-color-overlay: #fff; --el-text-color-primary: #243c35; --el-text-color-secondary: #5d716a; --el-border-color: #ccd8d2; --card-border: #ccd8d2; --card-radius: 8px; --el-color-success: #16a085; --el-color-success-light-9: #e8f7f1; }
      body { margin: 20px; font-family: sans-serif; } #app { width: 1000px; }
      </style></head><body><div id="app"></div><script type="module">
      import { createApp, h, ref, KeepAlive, nextTick } from 'vue';
      import { Map as LeafletMap } from 'leaflet';
      import ForestFireMap from '/src/views/dashboard/components/map/ForestFireMap.vue';
      import { baseLayers } from '/src/views/dashboard/components/map/mapConfig.ts';
      // dump-dom 虚拟时钟不保证 compositor 帧，测试关闭动画以确定性验证最终行为。
      LeafletMap.mergeOptions({ zoomAnimation: false, fadeAnimation: false });
      // 本地透明瓦片避免外部请求；只影响本测试浏览器内的模块实例。
      baseLayers.forEach(layer => layer.url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
      const active = ref(true); window.gisHarness = { active, nextTick };
      createApp({ setup: () => () => h(KeepAlive, null, { default: () => active.value ? h(ForestFireMap) : null }) }).mount('#app');
      const result = await (${browserChecks.toString()})();
      const output = document.createElement('pre'); output.id = 'gis-test-result'; output.textContent = JSON.stringify(result); document.body.append(output);
      </script></body></html>`;
      res.setHeader("Content-Type", "text/html");
      res.end(await server.transformIndexHtml("/__gis_test__.html", html));
    });
    await server.listen();
    const port = server.httpServer.address().port;
    const output = await new Promise((resolveOutput, reject) => {
      child = spawn(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
          `--user-data-dir=${profile}`,
          "--window-size=1366,900",
          "--dump-dom",
          "--virtual-time-budget=15000",
          `http://127.0.0.1:${port}/__gis_test__.html`,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("浏览器测试超过 45 秒"));
      }, 45000);
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolveOutput(stdout);
        else reject(new Error(`浏览器退出 ${code}: ${stderr.slice(-1500)}`));
      });
    });
    const match = output.match(/<pre id="gis-test-result">([^<]*)<\/pre>/);
    assert.ok(match, "浏览器未输出测试结果，请检查浏览器/Vite 运行环境");
    const result = JSON.parse(match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.equal(result.passed.length, 10);
  } finally {
    child?.kill();
    await server.close();
    // 只删除本测试创建且位于系统临时目录的独立浏览器配置。
    if (
      resolve(profile).startsWith(resolve(tmpdir()) + "\\") ||
      resolve(profile).startsWith(resolve(tmpdir()) + "/")
    ) {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});
