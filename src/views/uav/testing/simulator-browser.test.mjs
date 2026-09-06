import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { createBackendHarness } from "./backendHarness.mjs";

const browser =
  process.env.GIS_BROWSER ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
  ].find(existsSync);
const duration = process.env.GIS_SOAK === "1" ? 600000 : 2000;
const backendMode = process.env.FF_BACKEND_SMOKE === "1";
test(
  backendMode
    ? "Chromium real Python backend telemetry chain"
    : "Chromium simulator smoke / optional ten-minute wall-clock soak",
  { skip: !browser, timeout: duration + 90000 },
  async () => {
    const profile = mkdtempSync(join(tmpdir(), "forestfire-simulator-"));
    const backend = backendMode ? await createBackendHarness() : undefined;
    const server = await createServer({
      configFile: false,
      root: process.cwd(),
      plugins: [vue()],
      logLevel: "error",
      appType: "custom",
      define: backend
        ? {
            "import.meta.env.VITE_TELEMETRY_SOURCE": JSON.stringify("websocket"),
            "import.meta.env.VITE_TELEMETRY_WS_URL": JSON.stringify(backend.websocketUrl),
          }
        : {},
      optimizeDeps: {
        noDiscovery: true,
        include: ["vue", "vue-router", "leaflet", "pinia", "element-plus"],
      },
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
    });
    let child;
    let timeout;
    try {
      await backend?.start();
      const resultPromise = new Promise((resolveResult, reject) => {
        timeout = setTimeout(() => reject(new Error("模拟器浏览器测试超时")), duration + 80000);
        server.middlewares.use(async (req, res, next) => {
          if (
            backend &&
            req.method === "POST" &&
            ["/__backend_start__", "/__backend_stop__"].includes(req.url)
          ) {
            try {
              if (req.url === "/__backend_start__") await backend.start();
              else await backend.stop();
              res.end("ok");
            } catch (error) {
              res.statusCode = 500;
              res.end(error.message);
            }
            return;
          }
          if (req.url === "/__sim_result__" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) body += chunk;
            res.end("ok");
            resolveResult(JSON.parse(body));
            return;
          }
          if (req.url !== "/__sim_test__.html") return next();
          const html = `<!doctype html><html><head><style>body{font-family:sans-serif;margin:16px}#app{width:1000px}*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}</style></head><body><div id="app"></div><script type="module">
          import { createApp, h, ref, KeepAlive, nextTick } from 'vue';
          import { Map as LeafletMap } from 'leaflet';
          import { createPinia } from 'pinia';
          import { createRouter, createMemoryHistory } from 'vue-router';
          import ForestFireMap from '/src/views/dashboard/components/map/ForestFireMap.vue';
          import UavPage from '/src/views/uav/index.vue';
          import { useUavStore } from '/src/stores/uav.ts';
          import { useTelemetryStore } from '/src/stores/telemetry.ts';
          import { useUavSimulatorStore } from '/src/stores/uavSimulator.ts';
          import { baseLayers } from '/src/views/dashboard/components/map/mapConfig.ts';
          import { runSimulatorBrowserChecks } from '/src/views/uav/testing/simulatorBrowserChecks.mjs';
          import { runBackendBrowserChecks } from '/src/views/uav/testing/backendBrowserChecks.mjs';
          const maps=[]; LeafletMap.addInitHook(function(){maps.push(this)});
          LeafletMap.mergeOptions({zoomAnimation:false,fadeAnimation:false});
          baseLayers.forEach(layer => layer.url='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
          const pinia=createPinia(), store=useUavStore(pinia), telemetry=useTelemetryStore(pinia), simulator=useUavSimulatorStore(pinia);
          const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboard',component:ForestFireMap},{path:'/uav/list',component:UavPage}]});
          await router.push('/dashboard');
          const active=ref(true), view=ref('/dashboard'); router.afterEach(to=>view.value=to.path);
          const app=createApp({setup:()=>()=>h(KeepAlive,null,{default:()=>active.value?h(view.value==='/dashboard'?ForestFireMap:UavPage):null})}).use(pinia).use(router);
          app.mount('#app');
          let result;
          try { result=await ${backendMode ? "runBackendBrowserChecks" : "runSimulatorBrowserChecks"}({store,telemetry,simulator,active,nextTick,router,maps,duration:${duration}}); }
          catch(error){result={error:error.message,stack:error.stack};}
          app.unmount(); await fetch('/__sim_result__',{method:'POST',body:JSON.stringify(result)});
        </script></body></html>`;
          res.setHeader("Content-Type", "text/html");
          res.end(await server.transformIndexHtml("/__sim_test__.html", html));
        });
      });
      await server.listen();
      child = spawn(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          `--user-data-dir=${profile}`,
          "--window-size=1366,900",
          `http://127.0.0.1:${server.httpServer.address().port}/__sim_test__.html`,
        ],
        { windowsHide: true, stdio: "ignore" }
      );
      const browserError = new Promise((_, reject) => child.once("error", reject));
      const result = await Promise.race([resultPromise, browserError]);
      assert.equal(result.error, undefined, JSON.stringify(result));
      assert.equal(result.passed.length, 5);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
      clearTimeout(timeout);
      if (child && child.exitCode === null && child.signalCode === null) {
        await new Promise((resolveExit) => {
          const exitTimeout = setTimeout(resolveExit, 5000);
          child.once("close", () => {
            clearTimeout(exitTimeout);
            resolveExit();
          });
          child.kill();
        });
      }
      await server.close();
      await backend?.stop();
      if (
        resolve(profile).startsWith(resolve(tmpdir()) + "\\") ||
        resolve(profile).startsWith(resolve(tmpdir()) + "/")
      )
        await rm(profile, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
    }
  }
);
