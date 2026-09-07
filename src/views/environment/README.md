# 气象与环境火险因子 V1

本模块仅使用前端会话级 **DEV / MOCK** 数据。没有真实气象 API、DEM、机器学习、数据库或自动调度，不新增依赖。

## 页面与数据

沿用现有动态菜单和权限路由转换，追加“环境监测”。已存在同路径或同名菜单时保留上游配置。

| 路由                             | 功能                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `/environment/weather`           | 8 个站点、状态/区域筛选、观测详情、地图定位               |
| `/environment/forecast`          | 每站未来 24h，每 3h 一步，温度/湿度/风速三曲线与预报表    |
| `/environment/fire-risk-factors` | 现有 8 个风险区、场景选择、重新评估、八因子权重和风险解释 |

`types.ts` 定义 WeatherStation、WeatherObservation、WeatherForecast、FireRiskFactors。站点包含编号、所属单位、区域、关联风险区、位置、状态和最后观测时间。坐标 WGS84；经纬度存为命名字段，Leaflet 使用 `[latitude, longitude]`。内部时间统一 UTC ISO，UI 转本地时间；预报发布时间 `forecastAt` 与有效时间 `validAt` 分开。

观测和预报数值允许 `null`，UI 显示 `--`，图表保留断点，不能把缺测补成 0。温度 °C，湿度/土壤含水量/降雨概率 %，风速 m/s，风向 °，降雨 mm，气压 hPa，能见度 km，海拔 m。8 方位转换统一在 `model.ts`；气象风向是风的来向，例如 315° 为西北风 NW。

Mock 包含 online/offline/maintenance/warning 四种状态、高温低湿强风和低温湿润样例；离线站展示明确的最后观测快照。`weatherStore` 每站只保留最新一条观测，拒绝未知站点、非法值及倒序更新；`forecastStore` 保存 8 × 8 条预报。没有后台轮询。页面切换保留会话状态，退出登录/切租户先重置气象和预报，再重置既有 FireRisk Store。

## DEMO 风险模型

**不是正式森林火险行业标准。** 后续必须按区域、季节、植被、历史火情及行业规范重新标定权重、转换函数、阈值和数据时效。

每项因子为 `{ score, source, updatedAt }`。score 范围 0–100，**越高表示风险贡献越高**，不是原始观测值：低湿度、少降雨得到更高风险分。缺测可表示为 null，但无法完成评估。

| 因子          | 权重 | V1 来源与转换                             |
| ------------- | ---- | ----------------------------------------- |
| vegetation    | 15%  | Remote Sensing Mock 植被干燥样例          |
| moisture      | 15%  | NDMI / weather Mock 水分亏缺样例          |
| temperature   | 10%  | 最新观测温度在 0–40°C 映射至 0–100        |
| humidity      | 20%  | 100 − 相对湿度                            |
| wind          | 15%  | 最新观测风速在 0–20 m/s 映射至 0–100      |
| precipitation | 10%  | 100 − 24h 降雨在 0–20 mm 对应的百分数     |
| terrain       | 5%   | DEM Mock 地形样例，未加载真实 DEM         |
| history       | 10%  | Historical Fire Mock 样例，未从事件库统计 |

转换结果限制在 0–100；配置集中在 `config.ts`。权重非负且总和必须等于 1。综合分为 `Σ(score × weight)`，四舍五入到两位小数后分级：

| 分数区间  | 等级      |
| --------- | --------- |
| [0, 20)   | low       |
| [20, 40)  | moderate  |
| [40, 60)  | high      |
| [60, 80)  | very_high |
| [80, 100] | extreme   |

选择“干热强风/湿润降雨”只更新 Mock 观测，点击“重新评估”才刷新现有风险区的 score、level、factors、评估时间。气象四因子使用对应站点观测，另外四项保持自身 Mock 来源和时间。预报当前独立展示，尚未融合到现时评分，避免将未来值与当前观测混算。

缺失站点、观测或任意评分必需因子时，该区保留上次完整评估和时间，记录错误；其他区域继续计算，Dashboard 明确提示统计包含上次评估。V1 不将站点状态等同于观测有效性，当前使用最后快照，尚无正式观测过期策略。

## Store、地图和解释

`weatherStore → fireRiskStore.reassess → 既有 FireRiskLayer / Dashboard`，没有第二套风险区。重评估保留风险区 ID、几何和选中对象，通过现有适配器更新 Polygon 样式与 Popup。

风险详情显示八项原始因子分、权重、加权贡献、来源与时间。Top 3 按 **score × weight** 排序，解释实际总分贡献；详情和 Popup 使用同一工具。Dashboard 从同一 Store 派生极高风险数量、最高/平均评分和既有高风险数量（high、very_high、extreme）。

`useWeatherMapLayer.ts` 将 8 个独立 Marker 加入 Registry 管理的 WeatherStationLayer（基础地理分类，pane zIndex 590）。状态文字/颜色/符号集中配置，支持图层显隐、透明度和定位。坐标变化复用 Marker；图层隐藏再显示时 Leaflet 可重建图标 DOM，Marker 对象仍复用。WindLayer 仅预留定义，不实例化风场。

DrawingLayer 与气象、风险、遥感、UAV、Fire、Alert 隔离。地图停用/卸载释放 watcher、Popup 和监听器，返回按 Store 恢复。预报复用现有 ECharts 组件，KeepAlive 停用销毁图表，激活重建。

## 文件分工

- 本目录新增：types/config/model/mock、styles/style.css、mapPopup、mockMenu，weather/forecast/fire-risk-factors 三页面，FactorBreakdown/ForecastCharts 两组件，Node 与 Chromium 检查文件。
- 新增 Store：`src/stores/weather.ts`、`forecast.ts`。
- 新增地图/概况：`useWeatherMapLayer.ts`、`DashboardRiskSummary.vue`。
- 扩展现有：fireRisk、permission、user、tenant Store；地图 Registry、定义、样式、useForestMap；Dashboard；遥感风险模型/Mock/Popup/页面/文档；ECharts 显式 Vue 导入；相关回归测试。

## 运行与验证

使用项目现有 `pnpm dev`，登录后进入环境监测菜单，无需气象后端。

```sh
pnpm exec node --test src/views/environment/environment.test.mjs
pnpm exec node --test src/views/remote-sensing/remote-sensing.test.mjs src/views/fire/alerts/alerts.test.mjs src/views/fire/fire.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs src/views/uav/uav.test.mjs src/views/uav/telemetry/dataSources.test.mjs src/views/uav/simulator/simulator.test.mjs
pnpm exec node --test --test-concurrency=1 src/views/dashboard/components/map/testing/browser-smoke.test.mjs src/views/uav/testing/simulator-browser.test.mjs
pnpm run type-check
pnpm run build
```

Chromium 测试使用本机 Chrome/Edge 和现有 Vite，`GIS_BROWSER` 可指定可执行文件。测试页面隔离真实业务服务和外部瓦片。源码检查使用 `pnpm exec eslint <文件>`、`stylelint <样式或Vue文件>`、`prettier --check <文件>`；不要用全项目自动修复代替只读检查。
