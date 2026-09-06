# ForestFireAI MQTT 遥测接入 V1

仅 DEV / MOCK：Python Simulator 与 MQTT Consumer 共用 TelemetryBus，再由 WebSocket 推送前端。没有真实设备、控制命令、认证、数据库或持久化。既有管理后台 API、登录与 SSE 地址保持不变。

## 架构

```mermaid
flowchart LR
  S[同一个 Python Simulator] -->|direct| B[TelemetryBus]
  S -->|mqtt| M[Mosquitto Broker]
  P[DEV MQTT Publisher] --> M
  M --> C[MQTT Consumer / Pydantic]
  C --> B
  B --> W[WebSocket Manager]
  W --> T[Frontend Telemetry Store]
  T --> U[Leaflet / UAV UI]
```

```text
backend/app/
  main.py                 lifespan：按模式装配与释放资源
  core/config.py          集中配置、环境变量校验
  telemetry/models.py     TelemetryMessage，唯一遥测 schema
  telemetry/bus.py        publish / subscribe / unsubscribe
  mqtt/consumer.py        接收、发布、校验、重连、有限队列
  simulator/fleet.py      五架 Mock UAV，周期任务接受 publish 回调
  simulator/motion.py     连续运动，两个模式共用
  websocket/manager.py    总线订阅者，多客户端与发送超时隔离
  api/routes.py           Health、System Status、WebSocket
backend/tools/mqtt_uav_publisher.py   DEV TOOL，复用 fleet/schema
backend/tests/                      单元和真实 Broker 集成测试
 deploy/mqtt/mosquitto.conf          仅开发环境 Broker 配置
 docker-compose.yml                 仅开发环境 Compose
```

TelemetryBus 只接受 TelemetryMessage，订阅去重、取消订阅幂等，publish 等待订阅者完成并隔离普通异常；不保留历史、不启动无上限后台任务。WebSocket Manager 订阅总线，不区分消息来源，仍并发发送并单独移除失败/超时客户端。

新增运行依赖 `paho-mqtt==2.1.0`，使用其[网络线程和自动重连接口](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html)。MQTT 网络线程校验后写入最多 256 帧的线程安全队列，异步任务再发布到 Bus；队列满丢弃最旧帧。重连从 1 秒指数退避，最多 30 秒；重连重新订阅，收到成功 SUBACK 才显示 connected。服务启动不等待 Broker 可用。

MQTT 模式的 Simulator 用同一连接发布，必须经 Broker 回流才能进入 Bus，不直接双发。QoS 0、不 retain；断线丢弃模拟帧，不补发历史。关闭时停止 Simulator，断开 MQTT 并等待线程退出，取消消费任务、清空队列、取消总线订阅、释放 WebSocket。

## 安装

Python 3.11–3.13。PowerShell，在仓库根目录：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

仅运行可安装 requirements.txt；Linux/macOS 使用 `source .venv/bin/activate`。前端无新增依赖。本次使用 Python 3.13.11 与工作区虚拟环境中的 Paho，没有升级全局包。

## Direct 模式（默认，无需 Broker）

backend 目录、激活环境后：

```powershell
$env:TELEMETRY_INPUT_MODE = 'direct'
uvicorn app.main:app --reload
```

Simulator → Bus → WebSocket，MQTT 状态为 disabled，不建立 MQTT 连接。

## MQTT 模式与 Mosquitto

先准备 Docker / Docker Compose。在仓库根目录：

```powershell
docker compose up -d mqtt
docker compose logs -f mqtt
```

Compose 使用 eclipse-mosquitto:2.0.22，主机仅绑定 `127.0.0.1:1883`，只读挂载 [Mosquitto 配置](../deploy/mqtt/mosquitto.conf)。允许匿名、无 TLS、无持久化，**仅限开发环境，禁止作为生产配置使用**。停止用 `docker compose down`。本阶段不提供生产安全配置。

另开后端终端，进入 backend 并激活环境：

```powershell
$env:TELEMETRY_INPUT_MODE = 'mqtt'
$env:MQTT_HOST = '127.0.0.1'
$env:MQTT_PORT = '1883'
$env:MQTT_TOPIC_PREFIX = 'forestfire/uav'
uvicorn app.main:app --reload
```

五架内置 UAV 默认每秒经 Broker 发布。Broker 中断不停止 FastAPI 或 WebSocket；恢复后自动重连、重新订阅并继续遥测。

## 独立 DEV Publisher

避免两套模拟器同时发布相同 ID：在后端终端禁用内置 Simulator 再启动：

```powershell
$env:TELEMETRY_INPUT_MODE = 'mqtt'
$env:FORESTFIRE_SIMULATOR_ENABLED = 'false'
uvicorn app.main:app --reload
```

另一个激活环境的 backend 终端：

```powershell
$env:MQTT_HOST = '127.0.0.1'
$env:MQTT_PORT = '1883'
python tools/mqtt_uav_publisher.py --count 5
```

count 支持 1～5，默认五架、1 Hz；`--interval 0.5` 设置秒间隔。Ctrl+C 释放连接。工具复用现有 UavSimulator、运动模型与 TelemetryMessage。恢复内置模拟时设置 `FORESTFIRE_SIMULATOR_ENABLED=true` 并重启后端。

## 前端

仓库根目录 `.env.development.local`：

```dotenv
VITE_TELEMETRY_SOURCE=websocket
VITE_TELEMETRY_WS_URL=ws://127.0.0.1:8000/ws/telemetry
```

```powershell
pnpm dev
```

Dashboard / UAV 页面现有 DEV / MOCK SIMULATOR 显示 BACKEND WEBSOCKET 与连接状态。后端 direct/mqtt 切换无需修改前端配置；浏览器不连接 MQTT。本次未新增前端状态面板，后端/MQTT/输入模式/客户端数通过 System Status 查询。

切回本地用 `VITE_TELEMETRY_SOURCE=local` 并重启 Vite，或在现有面板选择 LOCAL SIMULATOR。切换清理旧遥测与轨迹，保留资产、Drawing 和业务图层。不要将 VITE_APP_API_URL 改为本后端；本服务没有原管理后台接口。HTTPS 页面使用 wss 地址。

## Topic、协议与状态

订阅 `forestfire/uav/+/telemetry`，发布 `forestfire/uav/{uavId}/telemetry`。Topic ID 必须逐字匹配 payload ID，否则拒绝并记录 UAV ID mismatch。前缀可配置，不接受空层级、通配符。

```json
{
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

经纬度 WGS84 度，高度为相对起飞点 m，速度 m/s，航向 [0,360)，电量/信号 [0,100]。时间必须带时区，模型统一转 UTC；非法 JSON、缺字段、非法范围、非有限数、未知 status 均隔离，单帧最大 16 KiB。status 为 online/offline/mission/charging/maintenance/warning。MQTT 可省略 type，模型补齐 `type: telemetry`；`/ws/telemetry` 输出协议不变。

GET `/api/v1/health`：

```json
{ "status": "ok", "service": "ForestFireAI Backend" }
```

GET `/api/v1/system/status`：

```json
{
  "backend": "ok",
  "mqtt": "connected",
  "telemetryInputMode": "mqtt",
  "connectedWebSocketClients": 2
}
```

mqtt 为 disabled/disconnected/connecting/connected/reconnecting/error。两个诊断端点按本任务要求直接返回 JSON，不套管理后台响应壳。浏览器打开 `http://127.0.0.1:8000/api/v1/system/status` 可查看。日志包含 MQTT/WebSocket 连接变化与坏消息，不输出正常逐帧遥测、密码或完整坏 payload。

## 配置

读取进程环境变量，不自动加载 .env；修改后重启服务。原有 FORESTFIRE 配置兼容。

| 环境变量                                           | 默认                             | 含义                                |
| -------------------------------------------------- | -------------------------------- | ----------------------------------- |
| TELEMETRY_INPUT_MODE                               | direct                           | direct / mqtt                       |
| MQTT_HOST / MQTT_PORT                              | 127.0.0.1 / 1883                 | Broker 地址                         |
| MQTT_USERNAME / MQTT_PASSWORD                      | 空                               | 可选凭据，不记录日志                |
| MQTT_TOPIC_PREFIX                                  | forestfire/uav                   | 不含末尾斜线                        |
| MQTT_KEEPALIVE                                     | 10                               | 秒                                  |
| MQTT_RECONNECT_MAX                                 | 30                               | 最大退避秒数                        |
| MQTT_QUEUE_SIZE                                    | 256                              | 接收队列帧数上限                    |
| MQTT_MAX_PAYLOAD_BYTES                             | 16384                            | 单帧字节上限                        |
| MQTT_POLL_INTERVAL                                 | 0.02                             | 队列空闲检查秒间隔                  |
| FORESTFIRE_SIMULATOR_ENABLED                       | true                             | false 时仅接外部 Publisher          |
| FORESTFIRE_TELEMETRY_INTERVAL                      | 1                                | 模拟周期秒数                        |
| FORESTFIRE_SIMULATION_BOUNDS                       | 119.45–119.95° E，30.08–30.42° N | west/east/south/north JSON          |
| FORESTFIRE_BATTERY_DRAIN_RATE                      | 0.005                            | 每秒电量百分点                      |
| FORESTFIRE_OFFLINE_TIMEOUT                         | 5                                | 契约默认秒数，UI 由前端独立阈值判定 |
| FORESTFIRE_SEND_TIMEOUT / FORESTFIRE_CLOSE_TIMEOUT | 0.25 / 0.25                      | WebSocket 超时秒数                  |

## 兼容与限制

Mock ID 为 mock-uav-1/3/6/7/8，与前端资产一致。连续运动、缓慢转向、高度/信号变化、电量下降与边界反弹复用现有模型；停顿后单步最多积分两秒。Broker 断开时 Simulator 仍推进运动状态。

Telemetry Store 继续拒绝未知 ID、未来时间、重复/乱序帧，按单架最后遥测超过五秒判 offline，新帧恢复状态。Marker 复用 setLatLng，Popup/详情/轨迹同源更新，每架轨迹最多 300 点。UAVLayer/UAVTrackLayer 显隐、透明度及 Drawing 隔离不变。

仅单进程、单模拟器开发链路，不要开启多个 Uvicorn worker。没有历史重放、可靠投递、持久化、认证、真实控制或时钟校正。重启 Python 回到初始位置；前端新增资产不会自动加入后端舰队，删除后前端拒绝该 ID 遥测。

## 测试

backend 目录：

```powershell
python -m pytest -q tests
```

两个真实 Broker 测试需提供 Mosquitto 可执行文件（使用随机回环端口、临时配置，不安装服务）：

```powershell
$env:MOSQUITTO_EXECUTABLE = 'C:\path\to\mosquitto.exe'
python -m pytest -q tests
```

未提供时明确 skip，不能视为真实链路通过。覆盖 Broker 初始不可用、运行中断开恢复、Simulator/Publisher、坏包隔离和多客户端分发。

仓库根目录：

```powershell
pnpm exec node --test src/views/uav/telemetry/dataSources.test.mjs src/views/uav/simulator/simulator.test.mjs src/views/uav/uav.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs
pnpm exec node --test --test-concurrency=1 src/views/dashboard/components/map/testing/browser-smoke.test.mjs src/views/uav/testing/simulator-browser.test.mjs
```

真实 Python → Chromium（自动启动/重启临时本机 Uvicorn）：

```powershell
$env:FORESTFIRE_PYTHON = (Resolve-Path backend/.venv/Scripts/python.exe).Path
$env:FF_BACKEND_SMOKE = '1'
$env:TELEMETRY_INPUT_MODE = 'direct'
pnpm exec node --test src/views/uav/testing/simulator-browser.test.mjs
```

MQTT Chromium：先启动 Broker，再将 TELEMETRY_INPUT_MODE 改 mqtt，配置 MQTT_HOST/PORT，运行同一测试。确保 FORESTFIRE_SIMULATOR_ENABLED=true。GIS_BROWSER 可指定 Chromium/Chrome/Edge；缺少浏览器明确 skip。

## 常见错误

- MQTT reconnecting：检查 Docker、端口映射、MQTT_HOST/PORT；Broker 恢复后自动重连。
- invalid payload：核对 JSON、必填字段、带时区时间、范围、status。
- UAV ID mismatch：Topic 与 payload 的 ID 必须完全相同。
- WebSocket connected 但 UAV offline：连接不代表设备在线；检查 Broker、Publisher 和两端时钟。
- 后端有数据但地图没有：前端只显示已有资产 ID；任意 UAV001 不会自动创建资产。
- 轨迹交替跳动：不要同时启动内置模拟器与相同 ID 的独立 Publisher。
- status 显示 disabled：环境变量必须设置在启动 Uvicorn 的同一终端。
- Docker 命令不存在：准备 Docker Compose 后再运行容器；本次机器无 Docker，使用工作区解包的 Mosquitto 2.0.22 验证真实网络，未执行 Compose 容器启动。
