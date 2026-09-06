# 无人机资产管理 V1

纯前端 Mock 模块，无新增依赖、API、数据库或设备通信。入口 `/uav/list`，菜单“无人机管理”。数据只在当前登录会话内存中保存；刷新、退出登录、切换租户后恢复八架虚构样例。

## 数据与状态

`types.ts` 定义 Uav、UavInput、UavPayload 和查询条件。资产包含身份、型号、所属单位、六种状态、位置、遥测快照、五种载荷能力及时间。WGS84 经纬度为度，Leaflet 边界转换为 `[纬度, 经度]`；高度为相对起飞点的 m，速度 m/s，航向度，电量和信号百分比，时间为 UTC ISO 8601。

`mock.ts` 创建八架独立样例，覆盖 online、offline、mission、charging、maintenance、warning。型号和位置均为虚构；最后在线时间不是当前连接状态。新建资产的高度、遥测和最后在线时间为空，界面显示“暂无快照/暂无记录”，不生成真实遥测假象。编辑状态只是修改 Mock 属性，不控制设备；载荷勾选只记录能力。

`src/stores/uav.ts` 是列表、详情、地图、Dashboard 无人机统计的单一数据源。`save` 统一新增与编辑，`remove` 删除，`select` 选择，`locate/consumeLocate` 管理一个可消费定位请求，`reset` 清理会话。列表采用整体替换通知地图；Pinia 不保存 Leaflet 对象。表单使用独立副本，取消不污染资产。身份与租户清理接入现有 user/tenant store。

`model.ts` 统一校验名称/SN/型号、SN 判重（忽略大小写及首尾空格）、经纬度有限值与合法范围、状态和载荷。列表支持名称/SN/单位搜索、状态与型号组合筛选、分页。`config.ts` 集中管理状态文字/颜色/符号、载荷名称和单位显示。

## 组件与地图

- `index.vue` 组合查询、分页、表格和弹窗；删除必须在页面管理的 Dialog 中二次确认，停用/卸载/会话切换关闭弹窗。
- `components/UavTable.vue`：列表与详情、定位、编辑、删除入口。
- `components/UavForm.vue`：新增/编辑及字段错误提示。
- `components/UavDetail.vue`、`UavStatus.vue`：列表和地图共用详情与状态展示。
- `components/UavMapSelection.vue`：地图选中摘要与详情入口。
- 地图 `composables/useUavMapLayer.ts`：从同一 store 创建 Marker，通过现有 `useBusinessLayers.attach` 工厂注册 UAVLayer。所有 Marker 与 Popup 使用 `ff-business-UAVLayer` pane，zIndex 720，保留面板显隐和透明度控制。
- Registry 新增 `replaceBusiness`，只替换指定已加载业务组的内容及数量，保留显隐/透明度/层级；不会触及 Drawing、Fire、Risk 或底图。数据更新和销毁先关闭 Popup，再解绑事件，避免孤立弹窗。

列表“定位”写入一个待定位请求后跳转 `/dashboard`。地图就绪后显示 UAVLayer、定位并打开 Popup；完全透明时恢复为不透明，其他透明度保留。请求只消费一次，不使用持续增长的路由 query 或第二套地图数据。点击 Marker 同步选中并显示摘要，可从地图下方打开详情。绘制时关闭并解绑 Popup，Marker 点击继续传递给绘制工具。

地图停用时释放订阅、Marker 和 Popup，激活后使用最新资产重建；业务图层偏好仍按原有 KeepAlive 规则恢复。资产变化不清除 DrawingLayer，清除绘制也不影响 UAVLayer。

## 菜单与范围

`mockMenu.ts` 在现有 permission store 的动态 RouteItem 转换前补充本地菜单；保留后端菜单、登录守卫及路由重置流程，冲突时优先保留后端配置。不写入上游演示菜单，不伪造用户角色或权限。本阶段所有已登录用户均可操作本地样例；未来真实 API 接入时应移除此 Mock 菜单补充，并由后端提供授权菜单及资产操作权限。

不包含真实位置、轨迹、任务、飞控、消息订阅、视频、AI 或后端持久化。八架样例的同步采用整组重建，面向本阶段小量资产；未来高频遥测需改为按 ID 更新 Marker。

## 验证

```powershell
corepack.cmd pnpm@10.32.1 exec node --test src/views/uav/uav.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs
corepack.cmd pnpm@10.32.1 exec node --test src/views/dashboard/components/map/testing/browser-smoke.test.mjs
corepack.cmd pnpm@10.32.1 run type-check
corepack.cmd pnpm@10.32.1 run build
```

`uav.test.mjs` 验证模型、组合查询、CRUD、校验失败、会话、Marker、定位及图层隔离；现有 Dashboard/GIS 测试继续回归。浏览器 harness 执行真实 Vue、Pinia、Router、Element Plus 与 Leaflet，`testing/browserChecks.mjs` 覆盖表单必填/SN/坐标、取消编辑、详情、定位、删除确认及页面重建。使用内嵌透明瓦片，无业务后端请求；本机无 Chromium 时明确跳过。ESLint、Stylelint 和 Prettier 使用修改文件范围进行只读检查。

## V1 文件清单

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
