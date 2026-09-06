# Dashboard GIS 基础工具

本模块使用已有 Leaflet 1.9.4 原生 API，无新增依赖、接口或数据库。所有用户操作仅修改当前地图会话的临时数据，沿用 Dashboard 现有访问权限，不创建业务写入权限或控制命令。

## 组织与图层

- `ForestFireMap.vue`：组合底图控制、统一 GIS 工具栏、地图和坐标显示。
- `useForestMap.ts`：异步地图初始化、底图、尺寸观察、默认视角与销毁顺序。
- `MapToolbar.vue`：工具选择、完成、取消、清除、显隐、默认视角和状态提示。
- `composables/useMapDrawing.ts`：唯一活动模式、草稿、预览、结果、事件订阅和释放。
- `composables/useMapMeasure.ts`：绘制与测量共用的结果文本和单位规则。
- `utils/geometry.ts`：球面长度、面积、坐标归一化和多边形有效性检查。
- `layers/mapLayerRegistry.ts`：每个地图实例独立的注册表，提供 `register/get/show/hide/clear/dispose`。

实际只创建 `BaseMapLayer` 与 `DrawingLayer`。未来 `UAVLayer`、`UAVTrackLayer`、`MissionLayer`、`FireEventLayer`、`RemoteSensingLayer`、`FireRiskLayer`、`ResourceLayer` 按需调用 `register(id)` 获取独立 LayerGroup；本次不创建其数据或业务模块。

每个草稿是 DrawingLayer 下的子 LayerGroup。点、节点、预览线面及独立结果 Tooltip 都通过该子组添加，不直接调用 `addTo(map)`。完成后保留该组；取消只移除草稿；清除只调用 DrawingLayer 的 `clearLayers()`。隐藏会取消未完成草稿并整体移除 DrawingLayer，已完成结果保留，显示后重新挂载。Leaflet 内部会将组成员注册到地图，但业务代码只通过所属组管理成员。

## 操作与生命周期

点击点工具后单击地图完成；折线、区域和测量可连续单击添加节点，双击、Enter 或“完成”结束。区域至少三个不同节点，折线至少两个节点。绘制时禁用双击缩放，退出后恢复此前状态；Esc、“取消”、再次点击当前工具退出。切换工具先取消草稿，再进入新模式，已完成结果保留。

“回到默认视角”取消草稿后读取 `mapConfig.center` 和 `mapConfig.zoom`。底图切换和隐藏不影响 DrawingLayer。地图停用/卸载时先退出绘制、清理事件与 DrawingLayer，再销毁注册表、地图和尺寸观察器；重新激活创建新图层和绘制会话。沿用原有地图视角恢复逻辑，临时结果不跨页面停用保存，也不写入 Pinia 或本地存储。

## 测量口径与限制

输入为 WGS84 经纬度（度），Leaflet 元组顺序为 `[纬度, 经度]`。坐标标签经度归一化至 `[-180, 180)`；跨日期线相邻节点按最短经度方向展开。

距离采用半径 6,371,000 m 的球面大圆距离，多段相加；小于 1,000 m 显示 m，否则 km。面积采用球面经纬度边界积分近似，小于 1,000,000 m² 显示 m²，否则 km²。数值保留两位小数。测量不包含地形起伏，不用于精密测绘。

只支持无孔的简单多边形；拒绝节点不足、自交/重叠、退化区域以及经度跨度达到 180° 的区域。有效纬度限制在 Web Mercator 的 ±85.05112878°。不包含编辑、撤销、导入导出或结果持久化。

## 验证

在仓库根目录运行（本机使用已有 pnpm 10.32.1）：

```powershell
corepack.cmd pnpm@10.32.1 exec node --test src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs
corepack.cmd pnpm@10.32.1 exec node --test src/views/dashboard/components/map/testing/browser-smoke.test.mjs
corepack.cmd pnpm@10.32.1 run type-check
corepack.cmd pnpm@10.32.1 exec eslint "src/views/dashboard/components/map/**/*.{ts,vue,mjs}" src/views/dashboard/dashboard.test.mjs
corepack.cmd pnpm@10.32.1 exec stylelint "src/views/dashboard/components/map/**/*.vue"
corepack.cmd pnpm@10.32.1 exec prettier --check "src/views/dashboard/components/map/**/*.{ts,vue,mjs,md}" src/views/dashboard/dashboard.test.mjs
corepack.cmd pnpm@10.32.1 exec prettier --check --ignore-path .gitignore src/views/dashboard/components/map/README.md
corepack.cmd pnpm@10.32.1 run build
```

Node 测试执行真实几何计算、Vue SFC 渲染与 KeepAlive 生命周期，Leaflet 替身验证图层隔离和监听器。浏览器测试使用本机 Chrome/Edge/Chromium（可通过 `GIS_BROWSER` 指定），加载真实 Vue/Leaflet 和内嵌透明瓦片，验证 DOM 点击、SVG/标签、工具切换及地图重建；没有浏览器时明确跳过。测试不请求上游业务 API，不验证外部瓦片供应商可用性。
