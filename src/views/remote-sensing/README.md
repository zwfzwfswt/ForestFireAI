# 遥感火险监测 V1

本模块仅使用前端会话级 Mock 数据和本地 SVG 示意图。所有图片明确标注 **MOCK / DEMO**，不是 Sentinel、NASA 或其他卫星观测；数值不由影像计算，不代表真实火险评估。没有新依赖、后端请求、数据下载或数据库写入。

## 入口与模型

沿用 `permission.ts` 的动态 RouteItem 转换，通过 `mockMenu.ts` 追加“遥感监测”。遇到同路径或同名上游菜单时保留上游配置。

| 路由                        | 功能                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `/remote-sensing/data`      | 8 景 Mock 影像；搜索、卫星、传感器、获取时间、最大云量、状态筛选；详情、缩略图与覆盖范围定位 |
| `/remote-sensing/products`  | 12 个产品；搜索、类型、生成时间、状态筛选；详情、图例、地图显示、单产品显隐和透明度          |
| `/remote-sensing/hotspots`  | 15 个热点；来源、时间、置信度、告警/事件关联筛选；详情、定位、显式生成告警                   |
| `/remote-sensing/fire-risk` | 8 个分区；搜索、等级筛选；分数、因素详情、定位                                               |

`types.ts` 定义 RemoteSensingScene、RemoteSensingProduct、SatelliteHotspot、FireRiskZone。坐标采用 WGS84，GeoJSON 为 `[longitude, latitude]`，Leaflet 转为 `[latitude, longitude]`，时间为 UTC ISO 8601。云量与因子范围 0–100；confidence 为 0–1 或 null；FRP 为 MW 或 null；亮温为 K 或 null，缺失值统一显示 `--`。

Scene 保留 bbox、CRS、来源、状态和少量 Mock 元数据，dataUrl 为 null。产品支持 RGB、NDVI、NDMI、NDWI、NBR、NBR2、LST、Fire Risk；只有 ready/available 可显示。八种示意图位于 `public/mock/remote-sensing/`。

## Store 与告警链路

- `remoteSensing.ts`：影像与产品目录、选中对象、显隐/透明度、地图定位请求。
- `satelliteHotspot.ts`：热点、选择、定位；从 Alert Store 的来源 ID 派生关联状态。
- `fireRisk.ts`：分区、选中对象、定位、高风险统计；复用环境模块的八因子加权 DEMO 模型，按 Mock 气象观测重新评估。

Store 不保存 Leaflet 实例，不持久化到浏览器存储。刷新恢复样例；退出登录、切换租户时重置。普通页面切换保留会话内选择和产品显示设置。

用户点击“生成告警”才调用既有 `FireAlertStore.createAlert`，使用 `type=satellite_hotspot`、`source=satellite`，携带原始位置、发现时间、置信度与 hotspot ID。缺失置信度保留 null；初始告警等级为 low、待人工研判，不由置信度推算。重复点击返回已关联告警，**不会创建 Fire Event**。

之后由既有告警中心人工研判、创建或关联事件。Hotspot 的 alertId、fireEventId 同步派生；标记重复时显示对应已有事件。Alert 重置后关联自动清空，无失效 ID。单独重置热点不会删除已生成的告警。

## 地图架构

复用 `mapLayerRegistry.ts`；`useRemoteSensingLayers.ts` 负责工厂、同步、定位和清理，不另建 Registry。

| 图层                  | pane zIndex | 内容                                       |
| --------------------- | ----------- | ------------------------------------------ |
| RemoteSensingLayer    | 300         | 除 Fire Risk 外的本地 ImageOverlay         |
| FireRiskLayer         | 310         | Fire Risk ImageOverlay 与 8 个风险 Polygon |
| SatelliteHotspotLayer | 600         | 15 个独立热异常 Marker                     |

保留既有 FireEvent=620、UAV=720、Alert=810、Drawing=900 等层级。影像在所属 pane 内使用子 zIndex=-1，使同组风险 Polygon 位于影像上方。每张影像先进入业务 LayerGroup，再由 Registry 挂载；没有 `imageOverlay.addTo(map)`。

既有 `HighRiskLayer` 仍作为原 GIS 示例保留；新增业务分区全部进入 FireRiskLayer。Dashboard 高风险数量仅统计 FireRisk Store 的 high、very_high、extreme（初始 4 处），不把原 GIS 示例再计入。

业务面板控制整组显隐、透明度和同一层级区间内的顺序。产品控制仅作用单张图片，**最终透明度 = 产品透明度 × 整组透明度**。默认产品全部隐藏；“地图显示”会显示产品、恢复所属组并定位覆盖范围。地图图例列出当前可见产品，可直接调透明度或隐藏；图片错误显示可重试提示。多个产品同时显示时各自保留图例，避免将一个图例用于整个混合画面。

样式、产品值域和图例集中在 `config.ts`；风险权重和分级阈值集中在 `../environment/config.ts`。风险 Popup 包含名称、等级、分数、更新时间及加权贡献最高的三个 Mock 风险因素，详情展示八项分数、权重、来源与时间。具体算法和缺测行为见[环境模块说明](../environment/README.md)。热点使用小圆形热异常符号，与 Alert、Fire Event 独立。

透明度更新及业务组显隐复用已存在 ImageOverlay；单产品隐藏释放图片与监听器，再显示按需创建。Marker 与 Polygon 按 ID 复用。KeepAlive 停用时停止 watcher、释放图层/Popup/listener，返回时从 Store 和业务组偏好恢复。绘制模式下关闭业务 Popup，清除 DrawingLayer 不影响遥感或其他业务图层。

## 开发与验证

使用现有前端运行方式 `pnpm dev`，登录后通过动态菜单访问。无需启动遥感后端。

```sh
pnpm exec node --test src/views/remote-sensing/remote-sensing.test.mjs
pnpm exec node --test src/views/dashboard/components/map/testing/browser-smoke.test.mjs
pnpm run type-check
pnpm run build
```

Node 测试覆盖目录/筛选、空值、Hotspot → Alert、人工事件关联、风险统计、Registry/pane、影像显隐/透明度/错误、Popup、图层隔离和销毁恢复。Chromium 在本地独立页面加载真实组件，验证四页面及 Leaflet，并保留 UAV、Fire、Alert、GIS 回归。

V1 限制：没有真实下载、指数计算、遥感 API、认证数据服务和实际火险模型；本地示意图为矩形 ImageOverlay，不是地理配准栅格。Mock 菜单沿用现有已登录演示机制，未来真实数据接入需单独实现服务端授权和发布契约。
