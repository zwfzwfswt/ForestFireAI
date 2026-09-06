# Dashboard GIS 工具与业务图层

本模块使用已有 Leaflet 1.9.4 原生 API，无新增依赖、接口或数据库。绘制仅修改当前地图会话的临时数据；UAV 资产来自会话级 Mock store，见 [无人机资产模块](../../../uav/README.md)。沿用现有登录访问链路，不创建真实业务写入权限或控制命令。

## 组织与图层

- `ForestFireMap.vue`：组合底图控制、统一 GIS 工具栏、地图和坐标显示。
- `useForestMap.ts`：异步地图初始化、底图、尺寸观察、默认视角与销毁顺序。
- `MapToolbar.vue`：工具选择、完成、取消、清除、显隐、默认视角和状态提示。
- `composables/useMapDrawing.ts`：唯一活动模式、草稿、预览、结果、事件订阅和释放。
- `composables/useMapMeasure.ts`：绘制与测量共用的结果文本和单位规则。
- `utils/geometry.ts`：球面长度、面积、坐标归一化和多边形有效性检查。
- `layers/mapLayerRegistry.ts`：每个地图实例独立的统一注册表，管理组、业务元数据、显隐、透明度、顺序和加载状态。
- `MapBusinessLayerPanel.vue`：六类折叠面板，展示符号、名称、状态，控制显隐、透明度和同层级顺序。
- `composables/useBusinessLayers.ts`：注册本地目录和 Mock 数据；通过浅引用发布只读快照，在 KeepAlive 停用/激活之间保留轻量偏好。
- `layers/layerDefinitions.ts`、`layerStyles.ts`、`layerPanes.ts`：集中定义分类、样式和空间层级。
- `layers/createBusinessLayer.ts`、`mock/mockMapLayers.ts`：GeoJSON 到 Leaflet 的边界转换和虚构演示数据。

保留 `BaseMapLayer`、`DrawingLayer` 的 `register(id)` 组 API。业务图层使用同一 Registry 的 `registerBusiness(definition, factory?)`：元数据包含 `id/name/category/visible/opacity/zIndex/type`，扩展 `band/symbol/source/pane/status/featureCount/error`。类型支持 marker、polyline、polygon、geojson、raster。工厂接收专用 pane 名称并返回 `{ layer, featureCount }`，所有子图形、图标阴影须使用该 pane；栅格也可通过工厂传入使用该 pane 的 TileLayer/ImageOverlay。当前 GeoJSON 适配器已统一处理点、线、面及其子图形，不需要分别编写图层控制逻辑。

`list/getState` 返回不可修改的元数据快照，`get` 获取所属组；`show/hide/setVisible` 切换显隐；`setOpacity` 校验 0–1 并设置整个 pane 的 CSS opacity（保留各符号固有填充透明度）；`setZIndex` 校验语义区间和占用；`move` 与同区间的相邻已加载图层交换 zIndex，保证没有同序值依赖添加顺序。`clear(id)` 只清空指定组，`dispose()` 释放本地图的全部资源。绘制按钮始终只调用 `clear("DrawingLayer")`，业务面板不提供批量清除入口。

业务状态包含 unconfigured、loading、ready、empty、error；注册失败记录原因并移除不完整组，不影响其他图层。无工厂条目显示“未配置”，不创建空业务组；隐藏不删除数据，透明度为 0 时禁止不可见图形捕获交互。此阶段工厂同步加载本地数据，不实现网络请求或异步加载协议。

## 业务分类与 Mock

| 分类     | 图层条目                        |
| -------- | ------------------------------- |
| 基础地理 | 行政区划、道路、水系            |
| 森林资源 | 林地范围、林班、小班、植被类型  |
| 火灾监测 | 当前火情、AI 告警、历史火点     |
| 无人机   | UAV、UAV 飞行轨迹、UAV 任务区域 |
| 火险信息 | 火险等级、高风险区域            |
| 应急资源 | 消防站、水源、避险点            |

共 18 个元数据条目；6 个 Mock 数据集加载 7 个要素：行政区面 1、道路线 1、火点 2、高风险面 1、消防站点 1、水源点 1。所有坐标均为 WGS84 GeoJSON `[经度, 纬度]`，面环闭合；名称和属性标记 Mock，不表示真实行政边界、火情或设施。其余条目只作目录设计，无数据、接口、控制或分析逻辑。未来遥感图层可使用 surface 区间注册；无需新增 Registry。

Dashboard 通过 `useUavMapLayer` 向现有 UAVLayer 注入八架 Mock 资产，并注册初始为空的 UAVTrackLayer。地图不另存 UAV 数据，读取资产与独立遥测的组合视图，按 ID 复用 Marker，通过 `setLatLng` 更新位置；轨迹复用 Polyline，通过 `setLatLngs` 更新，每架最多 300 点。Registry 的 `setFeatureCount` 仅同步数量与空层状态，保留面板偏好。轨迹 pane 为 `ff-business-UAVTrackLayer`，zIndex 520；UAV pane 为 720，清除 Drawing 不影响两者。停用先关闭 Popup 和数据监听，再释放地图；激活后恢复当前有界数据。绘制期间 UAV Popup 暂停，点击继续传递给绘制模式。其他未配置目录仍不实例化。模拟器控制及验证见[无人机模块说明](../../../uav/README.md#uav-simulator--实时遥测-v1)。

## pane 层级

| 空间层级                          | zIndex 范围 |
| --------------------------------- | ----------- |
| 底图 tilePane                     | 200         |
| 遥感 / 风险面 surface             | 300–349     |
| 行政区 / 森林资源 / 水系 boundary | 350–399     |
| 道路 road                         | 400–449     |
| 任务区域 mission                  | 450–499     |
| 无人机轨迹 track                  | 500–549     |
| 应急资源 resource                 | 550–599     |
| 火情 fire                         | 600–649     |
| 无人机 uav                        | 700–749     |
| 告警 / 交互 interaction           | 800–849     |
| Drawing 图形 / 标签               | 900 / 910   |

每个已加载业务层独立使用 `ff-business-<id>` pane；面板上移/下移只在同区间内操作。Drawing 使用 `ff-drawing`、`ff-drawing-label`，避免 Leaflet 默认 marker、tooltip pane 将业务标记盖在绘制图形上。面板位于地图画布外，折叠内容有最大高度，窄容器自动换行，不拦截绘图操作。

每个草稿是 DrawingLayer 下的子 LayerGroup。点、节点、预览线面及独立结果 Tooltip 都通过该子组添加，不直接调用 `addTo(map)`。完成后保留该组；取消只移除草稿；清除只调用 DrawingLayer 的 `clearLayers()`。隐藏会取消未完成草稿并整体移除 DrawingLayer，已完成结果保留，显示后重新挂载。Leaflet 内部会将组成员注册到地图，但业务代码只通过所属组管理成员。

## 操作与生命周期

点击点工具后单击地图完成；折线、区域和测量可连续单击添加节点，双击、Enter 或“完成”结束。区域至少三个不同节点，折线至少两个节点。绘制时禁用双击缩放，退出后恢复此前状态；Esc、“取消”、再次点击当前工具退出。切换工具先取消草稿，再进入新模式，已完成结果保留。

“回到默认视角”取消草稿后读取 `mapConfig.center` 和 `mapConfig.zoom`。底图切换和隐藏不影响 DrawingLayer。地图停用/卸载时先退出绘制、清理事件与 DrawingLayer，再销毁注册表、地图和尺寸观察器；重新激活创建新图层和绘制会话。沿用原有地图视角恢复逻辑，临时结果不跨页面停用保存，也不写入 Pinia 或本地存储。

业务图层的 visible、opacity、zIndex 在当前 Vue 组件的 KeepAlive 停用/激活之间保留，重新创建地图后按这些偏好加载 Mock。完整卸载或刷新后恢复配置默认值；无全局单例和跨用户持久化。Leaflet 实例只保存在 Registry 的非响应式 Map，Vue 仅持有状态快照。

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
