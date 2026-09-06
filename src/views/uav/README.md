# 无人机资产管理与本地模拟遥测 V1

实时遥测后端链路 V1 已加入 `local` / `websocket` 数据源；运行方式、消息协议、重连及阶段限制见 [backend/README.md](../../../backend/README.md)。下方资产与 Simulator V1 描述保留阶段背景；遥测现在也可来自 Python 后端，数据源切换与连接状态由原开发面板统一管理。

纯前端 Mock 模块，无新增依赖、API、数据库或设备通信。入口 `/uav/list`，菜单“无人机管理”。数据只在当前登录会话内存中保存；刷新、退出登录、切换租户后恢复八架虚构样例。

## 数据与状态

`types.ts` 定义 Uav、UavInput、UavPayload 和查询条件。资产包含身份、型号、所属单位、六种状态、位置、遥测快照、五种载荷能力及时间。WGS84 经纬度为度，Leaflet 边界转换为 `[纬度, 经度]`；高度为相对起飞点的 m，速度 m/s，航向度，电量和信号百分比，时间为 UTC ISO 8601。

`mock.ts` 创建八架独立样例，覆盖 online、offline、mission、charging、maintenance、warning。型号和位置均为虚构；最后在线时间不是当前连接状态。新建资产的高度、遥测和最后在线时间为空，界面显示“暂无快照/暂无记录”，不生成真实遥测假象。编辑状态只是修改 Mock 属性，不控制设备；载荷勾选只记录能力。

`src/stores/uav.ts` 保存唯一资产列表，`displayList` 组合独立 telemetry store 的最新模拟遥测供列表、详情和地图读取；遥测不改写资产及其更新时间。`save` 统一新增与编辑，`remove` 删除，`select` 选择，`locate/consumeLocate` 管理一个可消费定位请求，`reset` 清理会话。Pinia 不保存 Leaflet 对象。表单使用资产独立副本，取消不污染数据。身份与租户清理接入现有 user/tenant store。

`model.ts` 统一校验名称/SN/型号、SN 判重（忽略大小写及首尾空格）、经纬度有限值与合法范围、状态和载荷。列表支持名称/SN/单位搜索、状态与型号组合筛选、分页。`config.ts` 集中管理状态文字/颜色/符号、载荷名称和单位显示。

## 组件与地图

- `index.vue` 组合查询、分页、表格和弹窗；删除必须在页面管理的 Dialog 中二次确认，停用/卸载/会话切换关闭弹窗。
- `components/UavTable.vue`：列表与详情、定位、编辑、删除入口。
- `components/UavForm.vue`：新增/编辑及字段错误提示。
- `components/UavDetail.vue`、`UavStatus.vue`：列表和地图共用详情与状态展示。
- `components/UavMapSelection.vue`：地图选中摘要与详情入口。
- 地图 `composables/useUavMapLayer.ts`：从同一 store 创建 Marker，通过现有 `useBusinessLayers.attach` 工厂注册 UAVLayer。所有 Marker 与 Popup 使用 `ff-business-UAVLayer` pane，zIndex 720，保留面板显隐和透明度控制。
- Registry 的 `setFeatureCount` 只更新要素计数和空层状态；地图适配器按 ID 增删对象，位置通过 `setLatLng` 更新，状态变化更新图标，`setPopupContent` 保持打开的 Popup 内容最新。保留显隐/透明度/层级，不触及 Drawing、Fire、Risk 或底图。删除与销毁关闭 Popup 并解绑事件。

列表“定位”写入一个待定位请求后跳转 `/dashboard`。地图就绪后显示 UAVLayer、定位并打开 Popup；完全透明时恢复为不透明，其他透明度保留。请求只消费一次，不使用持续增长的路由 query 或第二套地图数据。点击 Marker 同步选中并显示摘要，可从地图下方打开详情。绘制时关闭并解绑 Popup，Marker 点击继续传递给绘制工具。

地图停用时释放订阅、Marker 和 Popup，激活后使用最新资产重建；业务图层偏好仍按原有 KeepAlive 规则恢复。资产变化不清除 DrawingLayer，清除绘制也不影响 UAVLayer。

## 菜单与范围

`mockMenu.ts` 在现有 permission store 的动态 RouteItem 转换前补充本地菜单；保留后端菜单、登录守卫及路由重置流程，冲突时优先保留后端配置。不写入上游演示菜单，不伪造用户角色或权限。本阶段所有已登录用户均可操作本地样例；未来真实 API 接入时应移除此 Mock 菜单补充，并由后端提供授权菜单及资产操作权限。

不包含真实设备位置、任务、飞控、消息订阅、视频、AI 或后端持久化。模拟遥测与模拟轨迹见下节；Marker 仅在资产新增或地图重新初始化时创建，遥测更新复用现有对象。

## UAV Simulator + 实时遥测 V1

地图与资产页面提供 **DEV / MOCK SIMULATOR** 折叠面板，初始不自动运行。支持启动、暂停全部、恢复全部、单机暂停/恢复、重置模拟遥测。初始八架资产中，演示范围内 online / mission / warning 的五架可模拟；offline / charging / maintenance 不自动起飞。恢复全部也解除单机暂停。重置只清理模拟遥测和轨迹、停止调度，不撤销资产 CRUD。

数据流为 `Mock 资产 → simulator/runtime → telemetry store → UAV displayList/selectedUav → UAVLayer / 详情`。`simulator/config.ts` 集中配置 1000 ms 更新、5000 ms 离线阈值、每架最多 300 个轨迹点、演示边界和每秒 0.005 个百分点耗电。`motion.ts` 以速度、航向和时间积分得到连续位置，航向缓慢偏转；靠近边界转向中心，边缘兜底反弹。高度与信号小幅波动。长时间挂起最多积分两秒，恢复先发当前位置心跳，不追赶暂停期间距离。本阶段保留航向数值，不旋转图标。

`src/stores/telemetry.ts` 只保留每架最新包和有上限轨迹；接收 UTC epoch ms 时间，验证已登记 UAV ID、有限值、经纬度、状态、单位范围，拒绝未来时间、重复和乱序包。超过五秒无新包时组合视图显示 offline，保留最后已知位置及遥测更新时间；恢复包自动更新状态。尚未收到模拟包的资产保持原始 Mock 快照，不能解释为真实在线。运行中的五架模拟状态为 online，低电量模拟为 warning。

`src/stores/uavSimulator.ts` 通过统一 Data Source 包装非响应式调度器或 WebSocket，Pinia 仅暴露可序列化运行状态。地图与资产页面使用同一 owner 集合，挂载/激活幂等获取，停用/卸载释放；最后一个相关页面离开后清除来源 timer/连接，再进入时恢复此前运行状态。Telemetry Store 现在有一个独立的视图级离线时钟，手动断开 WebSocket 也能继续按单机时间判离线；无独立逐机 timer。退出登录或切换租户沿用 UAV 会话重置并停止来源。刷新不持久化任何模拟数据。

轨迹注册到既有 `UAVTrackLayer`，pane `ff-business-UAVTrackLayer`、zIndex 520；每架复用一条 Polyline，通过 `setLatLngs` 更新，最多 300 点。UAVLayer 使用 720。两者均由现有业务面板控制，隐藏时继续积累有界数据，显示时恢复最新位置；清除 Drawing 不影响轨迹。删除资产同时移除遥测、轨迹、Marker 和选中项。资产初始状态/坐标修改后重新播种，编辑名称等元数据不中断模拟。

专项验证命令（已有工具，无新增依赖）：

```powershell
corepack.cmd pnpm@10.32.1 exec node --test src/views/uav/simulator/simulator.test.mjs
corepack.cmd pnpm@10.32.1 exec node --test src/views/uav/testing/simulator-browser.test.mjs
$env:GIS_SOAK = '1'
corepack.cmd pnpm@10.32.1 exec node --test src/views/uav/testing/simulator-browser.test.mjs
Remove-Item Env:GIS_SOAK
```

专项 Node 测试包含五机 600 次确定性时钟推进、严格离线边界、非法包、生命周期、Marker/Polyline 身份复用、图层隔离及清理。Chromium 使用真实组件、真实计时器和内嵌透明瓦片，不访问设备或业务后端。默认做功能冒烟，`GIS_SOAK=1` 在功能检查后再按真实墙钟持续十分钟，检查对象身份、监听器数量和轨迹上限；不使用虚拟时间冒充持续运行。输出观察到的 tick 数和时长，不把检查耗时当作 FPS 基准。

## 验证

```powershell
corepack.cmd pnpm@10.32.1 exec node --test src/views/uav/uav.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs
corepack.cmd pnpm@10.32.1 exec node --test src/views/dashboard/components/map/testing/browser-smoke.test.mjs
corepack.cmd pnpm@10.32.1 run type-check
corepack.cmd pnpm@10.32.1 run build
```

`uav.test.mjs` 验证模型、组合查询、CRUD、校验失败、会话、Marker、定位及图层隔离；现有 Dashboard/GIS 测试继续回归。浏览器 harness 执行真实 Vue、Pinia、Router、Element Plus 与 Leaflet，`testing/browserChecks.mjs` 覆盖表单必填/SN/坐标、取消编辑、详情、定位、删除确认及页面重建。使用内嵌透明瓦片，无业务后端请求；本机无 Chromium 时明确跳过。ESLint、Stylelint 和 Prettier 使用修改文件范围进行只读检查。

## Simulator V1 变更清单

新增 10 个文件：

```text
src/stores/telemetry.ts
src/stores/uavSimulator.ts
src/views/uav/components/UavSimulatorPanel.vue
src/views/uav/simulator/config.ts
src/views/uav/simulator/types.ts
src/views/uav/simulator/motion.ts
src/views/uav/simulator/runtime.ts
src/views/uav/simulator/simulator.test.mjs
src/views/uav/testing/simulator-browser.test.mjs
src/views/uav/testing/simulatorBrowserChecks.mjs
```

修改 13 个文件；无删除、无新增依赖：

```text
src/stores/uav.ts
src/views/uav/types.ts
src/views/uav/config.ts
src/views/uav/index.vue
src/views/uav/components/UavDetail.vue
src/views/uav/README.md
src/views/dashboard/index.vue
src/views/dashboard/components/map/ForestFireMap.vue
src/views/dashboard/components/map/useForestMap.ts
src/views/dashboard/components/map/composables/useUavMapLayer.ts
src/views/dashboard/components/map/layers/mapLayerRegistry.ts
src/views/dashboard/components/map/testing/leafletStub.mjs
src/views/dashboard/components/map/README.md
```

本次 Node 回归共 52 项通过（原有 43 项、新增 9 项）。Chromium 覆盖原有 GIS/资产 19 个场景及模拟器 5 组场景。真实持续测试观察 600.998 秒、五架 UAV、配置 1 Hz，采样观察到 596 次更新时间变化；Marker 重建 0、监听器数量增长 0，每架轨迹保持 300 点。采样与模拟调度各自计时，观察次数不是精确发包计数。另以确定性 600 tick 验证运动距离、耗电及对象复用。未进行 GPU/FPS 或完整堆内存基准，性能结论仅覆盖上述观测项。

TypeScript、修改范围 ESLint / Stylelint / Prettier、Production Build 均通过。Windows 浏览器退出后的目录占用问题已在测试清理阶段通过等待退出、异步重试处理。无真实设备、网络协议或后端接入；航向保留数据展示，图标暂不旋转。

## 资产 V1 原始文件清单（历史）

新增 16 个文件（路径相对仓库根目录）：

```text
src/stores/uav.ts
src/views/dashboard/components/map/composables/useUavMapLayer.ts
src/views/uav/index.vue
src/views/uav/types.ts
src/views/uav/config.ts
src/views/uav/model.ts
src/views/uav/mock.ts
src/views/uav/mockMenu.ts
src/views/uav/components/UavTable.vue
src/views/uav/components/UavForm.vue
src/views/uav/components/UavDetail.vue
src/views/uav/components/UavStatus.vue
src/views/uav/components/UavMapSelection.vue
src/views/uav/uav.test.mjs
src/views/uav/testing/browserChecks.mjs
src/views/uav/README.md
```

修改 13 个文件；无删除文件：

```text
src/stores/permission.ts
src/stores/user.ts
src/stores/tenant.ts
src/views/dashboard/index.vue
src/views/dashboard/dashboard.test.mjs
src/views/dashboard/components/map/ForestFireMap.vue
src/views/dashboard/components/map/useForestMap.ts
src/views/dashboard/components/map/composables/useBusinessLayers.ts
src/views/dashboard/components/map/layers/mapLayerRegistry.ts
src/views/dashboard/components/map/gis-tools.test.mjs
src/views/dashboard/components/map/testing/leafletStub.mjs
src/views/dashboard/components/map/testing/browser-smoke.test.mjs
src/views/dashboard/components/map/README.md
```
