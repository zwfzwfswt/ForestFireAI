# ForestFireAI 实时遥测后端链路 V1

本阶段仅提供 Python 模拟遥测、Health API 和 WebSocket 推送。不提供资产 CRUD、认证、真实设备控制或持久化；既有管理后台 API、登录和 SSE 保持原地址。

## 启动

使用 Python 3.11–3.13（本次验证为 3.13.11）。首次建立独立环境，以下为 PowerShell：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

仅运行服务可安装 `requirements.txt`。运行依赖为 FastAPI、Pydantic、Uvicorn、websockets；开发测试另用 pytest、httpx。版本固定为本次验证版本，没有引入数据库或消息中间件。Linux/macOS 使用 `source .venv/bin/activate` 激活。

已激活环境后，在仓库根目录打开后端终端：

```powershell
cd backend
uvicorn app.main:app --reload
```

Uvicorn 默认绑定本机 `127.0.0.1:8000`。本阶段使用一个 worker；每个进程有独立模拟状态，不支持多 worker 共享舰队。停止或 reload 会销毁旧任务和连接，新进程从 Mock 初始位置开始。

另开前端终端，在仓库根目录配置 `.env.development.local`：

```dotenv
VITE_TELEMETRY_SOURCE=websocket
VITE_TELEMETRY_WS_URL=ws://127.0.0.1:8000/ws/telemetry
```

```powershell
pnpm dev
```

进入 Dashboard 或无人机管理页面，展开 `DEV / MOCK SIMULATOR`。WebSocket 模式自动连接；显示 `BACKEND WEBSOCKET` 及连接状态，可手动断开、重新连接或断开并清除遥测。连接状态与单架 UAV 的在线状态分别显示。

切回本地模式，在 `.env.development.local` 设置并重启 Vite：

```dotenv
VITE_TELEMETRY_SOURCE=local
```

本地默认不自动模拟，点击“启动全部模拟器”。也可直接在面板切换来源；运行时选择只保留在当前前端会话，刷新后按环境配置恢复。切换会停止旧来源、清除旧遥测和轨迹，然后启用新来源；资产、Drawing 和其他业务图层不清除。HTTPS 页面应配置 `wss://` 地址。

不要把 `VITE_APP_API_URL` 改为本后端：V1 没有实现原有管理后台登录/菜单/系统接口。新的 WS 地址单独配置，不使用 Axios，也不携带现有认证 Token。

## 工程结构

```text
backend/
  app/
    main.py                 应用工厂、lifespan、模拟任务释放
    api/routes.py           GET /api/v1/health、/ws/telemetry
    core/config.py          Pydantic 配置与环境变量
    telemetry/models.py     严格校验的遥测消息
    simulator/motion.py     连续运动模型
    simulator/fleet.py      五架 Mock UAV、单一周期任务
    websocket/manager.py    connect / disconnect / broadcast
  tests/test_backend.py
  requirements.txt
  requirements-dev.txt
```

应用通过 lifespan 创建一份五机模拟器和连接管理器。每个周期推进状态，广播同一份帧给所有客户端，不为每个连接启动模拟器。并发发送设定超时，坏连接和慢连接单独移除；接收端监听断开事件，关闭失败仍从集合释放。关闭应用时取消并等待模拟任务，再关闭全部连接。该组织沿用 [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/) 和 [WebSocket 生命周期](https://fastapi.tiangolo.com/advanced/websockets/) 的接口。

## 协议和单位

`GET /api/v1/health` 返回 HTTP 200，按本次明确要求使用独立 Health 响应，不套管理后台响应壳：

```json
{ "status": "ok", "service": "ForestFireAI Backend" }
```

`/ws/telemetry` 是仅推送端点，每个 JSON 文本消息对应一架 UAV：

```json
{
  "type": "telemetry",
  "uavId": "mock-uav-1",
  "timestamp": "2026-09-07T00:00:00.000000Z",
  "longitude": 119.52,
  "latitude": 30.13,
  "altitude": 80,
  "speed": 4,
  "heading": 0,
  "battery": 92,
  "signal": 96,
  "status": "online"
}
```

时间是 UTC ISO 8601，前端适配为 Telemetry Store 已有的 epoch 毫秒。经纬度为 WGS84 度，高度是相对起飞点 m，速度 m/s，航向 `[0,360)` 度，电量和信号为 `[0,100]` 百分比。合法状态沿用 online/offline/mission/charging/maintenance/warning；本模拟器输出 online 或低电量 warning。没有客户端控制命令，输入消息不触发设备动作。

前端适配器验证消息类型、长度、时间及字段范围，忽略非法消息；Telemetry Store 继续拒绝未知 ID、未来时间及重复/乱序包。后端与浏览器时钟需一致；V1 不做时钟偏移估计。断线期间保留最后遥测，按每架采集时间超过五秒判 offline；一架更新不会延长另一架的时效。

## 模拟器与配置

五架 ID 为 `mock-uav-1/3/6/7/8`，与现有前端八架资产中的可模拟设备一致。按当前位置、航向、速度和时间积分移动，航向缓慢变化；接近边界转向中心，边缘兜底反弹。高度与信号小幅变化，电量随模拟时间下降。长时间暂停最多积分两秒，避免恢复后大幅跳跃。后端只保存五架最新状态，不保存无限轨迹；前端 UAVTrackLayer 继续每架最多 300 点。

集中配置见 `app/core/config.py`，可通过相应环境变量覆盖：

| 配置                         | 默认值                           | 环境变量                                           |
| ---------------------------- | -------------------------------- | -------------------------------------------------- |
| telemetry_interval           | 1 秒                             | FORESTFIRE_TELEMETRY_INTERVAL                      |
| simulation_bounds            | 119.45–119.95° E，30.08–30.42° N | FORESTFIRE_SIMULATION_BOUNDS（JSON）               |
| battery_drain_rate           | 0.005 个百分点/秒                | FORESTFIRE_BATTERY_DRAIN_RATE                      |
| offline_timeout              | 5 秒                             | FORESTFIRE_OFFLINE_TIMEOUT                         |
| send_timeout / close_timeout | 各 0.25 秒                       | FORESTFIRE_SEND_TIMEOUT / FORESTFIRE_CLOSE_TIMEOUT |

`offline_timeout` 记录后端契约默认值；实际 UI 离线判定由前端 `simulator/config.ts` 的 `offlineTimeout` 执行，修改阈值时需保持两侧一致。本阶段没有远程配置协议。

## 前端数据源和恢复

`src/views/uav/telemetry/dataSources/` 提供 `TelemetryDataSource`：`start/stop/subscribe/unsubscribe/subscribeState`。`localSimulatorSource.ts` 包装现有模拟器并保留暂停控制，`websocketSource.ts` 管理浏览器原生 WebSocket。`src/stores/uavSimulator.ts` 沿用现有会话控制入口，互斥选择来源并将包送入 `useTelemetryStore.updateTelemetry`；UI 和 Leaflet 不直接创建连接。

连接状态为 disconnected/connecting/connected/reconnecting/error；重连间隔为 1、2、4、8、16、30 秒，之后封顶 30 秒。收到有效遥测才重置退避，避免只握手就立即断开的连接持续高频重试；握手超过 10 秒也进入重连。错误原因显示在面板。旧连接回调带代次校验，stop 时解绑监听器、取消握手与重连计时，迟到消息不能写回。

地图和资产页共享一份数据源，多个页面 owner 不重复创建连接；最后一个相关页面停用/卸载后关闭连接和时钟，再激活按此前运行意愿恢复。手动断开期间仍有一个视图级离线时钟，避免把“无连接”等同于所有 UAV 状态；离开相关页面则停止此时钟。退出登录或切换租户沿用现有会话清理，停止来源并清空遥测，不自动续用旧会话连接。

地图侧没有第二套逻辑：继续从 UAV 组合视图读取位置并复用 Marker，通过 `setLatLng`、`setPopupContent`、`setLatLngs` 更新。UAVLayer 和 UAVTrackLayer 的显隐、透明度、pane 与 Drawing 隔离维持原有实现。

## 验证

后端（在 backend 目录与已安装测试依赖的环境）：

```powershell
python -m pytest -q tests
```

前端（仓库根目录）：

```powershell
pnpm exec node --test src/views/uav/telemetry/dataSources.test.mjs src/views/uav/simulator/simulator.test.mjs src/views/uav/uav.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs
pnpm exec node --test src/views/dashboard/components/map/testing/browser-smoke.test.mjs src/views/uav/testing/simulator-browser.test.mjs
```

真实 Python → Chromium 端到端测试会自行启动、停止、重启临时本机后端，测试真实网络断线与恢复；不用上游 API 或外部瓦片：

```powershell
$env:FORESTFIRE_PYTHON = (Resolve-Path backend/.venv/Scripts/python.exe).Path
$env:FF_BACKEND_SMOKE = '1'
pnpm exec node --test src/views/uav/testing/simulator-browser.test.mjs
Remove-Item Env:FF_BACKEND_SMOKE
```

`FORESTFIRE_PYTHON` 可指定任何安装了 requirements 的解释器；`GIS_BROWSER` 可指定 Chrome/Edge/Chromium。没有浏览器时测试明确跳过，不能视为浏览器验证通过。本次使用已有 Python 3.13.11 环境，无全局安装或升级。

## 当前限制

仅 DEV / MOCK 无认证链路，无真实设备和持久化。不替代现有管理后台后端，不实现文档中规划的认证实时总线。前端资产 CRUD 不同步到 Python：新增资产不会自动进入后端模拟，删除后前端拒绝该 ID 的后续遥测；重启后端恢复五机初值，轨迹中会出现此次重启的位移变化。不同来源的位置也可能不同，因此切换来源清空旧轨迹。没有断线期间历史帧重放、服务器时钟校正或多进程共享状态。

## 本次验证与文件清单

后端测试 8/8、前端自动化 60/60 通过。Chromium 原有 GIS/资产 19 个场景、本地模拟器 5 组场景、真实 Python 后端链路 5 组场景均通过。真实链路测试包含停止/重启 Uvicorn、自动重连、按遥测时间离线、页面切换以及 Marker 身份保持。TypeScript、修改代码 ESLint / Stylelint / Prettier、Production Build、`git diff --check` 通过。根 README 只检查新增段落并保留原有模板排版；Python 不使用 Prettier。

前端无新增依赖；新增后端依赖文件记录四个运行包与两个测试包，验证使用本机已有环境。没有删除文件，没有执行 git commit / push。

修改 10 个文件：

```text
.env.development
README.md
types/env.d.ts
src/stores/telemetry.ts
src/stores/uavSimulator.ts
src/views/uav/README.md
src/views/uav/index.vue
src/views/uav/components/UavDetail.vue
src/views/uav/components/UavSimulatorPanel.vue
src/views/uav/testing/simulator-browser.test.mjs
```

新增 25 个文件：

```text
backend/.gitignore
backend/README.md
backend/requirements.txt
backend/requirements-dev.txt
backend/app/__init__.py
backend/app/main.py
backend/app/api/__init__.py
backend/app/api/routes.py
backend/app/core/__init__.py
backend/app/core/config.py
backend/app/simulator/__init__.py
backend/app/simulator/fleet.py
backend/app/simulator/motion.py
backend/app/telemetry/__init__.py
backend/app/telemetry/models.py
backend/app/websocket/__init__.py
backend/app/websocket/manager.py
backend/tests/test_backend.py
src/views/uav/telemetry/config.ts
src/views/uav/telemetry/dataSources.test.mjs
src/views/uav/telemetry/dataSources/types.ts
src/views/uav/telemetry/dataSources/localSimulatorSource.ts
src/views/uav/telemetry/dataSources/websocketSource.ts
src/views/uav/testing/backendHarness.mjs
src/views/uav/testing/backendBrowserChecks.mjs
```
