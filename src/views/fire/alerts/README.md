# 统一告警中心 V1（DEV / MOCK）

登录后通过“火情管理 → 告警中心”访问 `/fire/alerts`。沿用原动态菜单注入与路由转换，保留 `/fire/events`，不覆盖上游已有火情路由。运行 `pnpm dev` 即可，不需要后端服务。

## 告警与事件

Fire Alert 是疑似信号，有独立类型与研判状态；Fire Event 是处置对象。告警确认与创建/关联事件是两个明确的人工动作，**确认不自动创建事件**。既有手工事件工作流保持原实现；从已确认告警创建时，共用 Event 创建方法与状态机，生成已确认事件和相应 Timeline。

`types.ts` 定义身份、集中生成的 `ALERT-YYYYMMDD-NNN` 编号、标题、类型、来源、等级、位置、发现/接收时间、置信度、媒体字段、描述、研判人/时间/意见、事件关联与创建/更新时间。坐标沿用 WGS84 与地图有效纬度范围；时间 UTC ISO 存储、本地时区显示。置信度取 0–1 或 null，界面统一为一位小数百分比或 `--`，人工信号不伪造置信度。

`config.ts` 集中维护类型、来源、状态、等级的 label/icon/color/sort。来源与等级复用 Fire 模块语义常量，**状态机独立**：

```text
new → reviewing → confirmed
                → rejected
                → duplicate
```

终态不可回退或重复提交；驳回、重复要求理由。开始研判后不能改写原始信号。`updateAlert` 只接收输入白名单，无法修改状态、编号、研判结果或关联字段。

## Store 与关联

`src/stores/fireAlert.ts` 是列表、详情、地图与 Dashboard 的单一告警来源。提供 createAlert、updateAlert、startReview、confirmAlert、rejectAlert、markDuplicate、linkFireEvent、createFireEventFromAlert、locateAlert、选择及 reset。

- 创建：仅允许 confirmed 且未关联的 Alert；调用 Event Store 的 `createFromAlert`，共享原创建构造器、校验、编号和状态机，带入位置、时间、来源、置信度、标题、描述与等级。
- 关联：显式选择已有 Event，经检查后同时设置 `alert.fireEventId` 和 `event.alertIds`。不改写既有事件标题、位置或状态。同一告警不能重复关联或改绑，重复创建不会产生新事件。
- 重复：采用 `duplicateOfFireEventId`，必须选择存在的火情并填写理由；表示同一事件的重复来源信号，不把 duplicate 当作又一条 confirmed，也不创建新事件。重复归属与正式关联在详情中分开显示。
- Event Store 不依赖 Alert Store；它仅提供创建、追加关联和会话关联重建动作。普通操作同步完成，无异步窗口；校验在写入之前。未来接后端仍须用数据库事务与并发版本校验。
- 退出登录和租户变更显式 reset；Event Store 单独 reset 时也同步重置告警，避免悬空关系。Alert reset 重建初始样例与双向关联，不删除已有 Event 或其处置历史。刷新不持久化。

## Mock、页面、地图

16 条 Mock 覆盖6种类型、7种来源、5种状态和4种等级。其中3条 confirmed 告警已双向关联现有火情；2条 duplicate 指向同一火情，位置也分布在该火情附近。部分样例提供本地 SVG 示意图片，明确不是照片或 AI 检测结果，无外部图片请求。视频只预留字段，不播放视频流。

`index.vue`：关键词、类型、来源、状态、等级、时间范围组合筛选及分页。
`AlertTable.vue`：告警摘要、关联事件编号、研判详情和地图定位。
`AlertDetail.vue`：证据与信息、人工研判、显式创建/关联、重复归属、跳转关联火情。
`AlertMapSelection.vue`：地图选择与详情生命周期，未打开时不挂载 Drawer；停用/卸载关闭并释放视图。

`useAlertMapLayer.ts` 在**现有 Registry** 注册独立 `FireAlertLayer`，所有 Marker 进入其子 LayerGroup。使用 `ff-business-FireAlertLayer` pane、zIndex 810；FireEventLayer 保留 620，Drawing 为 900/910。圆形虚线告警符号与方形实线事件符号区分，告警类型/等级/状态共同控制样式。Marker 按 ID 复用，Popup 文字转义并包含关联事件编号和“查看告警”。业务面板控制显隐、透明度和顺序；绘制期间暂停 Popup/选择，清除 Drawing 不影响告警、事件、UAV、轨迹或风险层。

Dashboard 删除独立告警 Mock，直接读取 Store 的最新5条 `new/reviewing`；研判完成立即退出该视图。统计同时读取待处理数和 AI 来源数。点击卡片打开同一告警详情。

## 验证

```powershell
corepack.cmd pnpm@10.32.1 exec node --test src/views/fire/alerts/alerts.test.mjs src/views/fire/fire.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs src/views/uav/uav.test.mjs src/views/uav/telemetry/dataSources.test.mjs src/views/uav/simulator/simulator.test.mjs
corepack.cmd pnpm@10.32.1 exec node --test --test-concurrency=1 src/views/dashboard/components/map/testing/browser-smoke.test.mjs src/views/uav/testing/simulator-browser.test.mjs
corepack.cmd pnpm@10.32.1 run type-check
corepack.cmd pnpm@10.32.1 exec eslint src/views/fire/alerts src/stores/fireAlert.ts src/stores/fireEvent.ts src/views/dashboard/components/map/composables/useAlertMapLayer.ts
corepack.cmd pnpm@10.32.1 exec stylelint "src/views/fire/alerts/**/*.vue" src/views/dashboard/components/DashboardAlerts.vue
corepack.cmd pnpm@10.32.1 exec prettier --check src/views/fire/alerts src/stores/fireAlert.ts src/stores/fireEvent.ts
corepack.cmd pnpm@10.32.1 exec prettier --check --ignore-path .gitignore src/views/fire/alerts/README.md
corepack.cmd pnpm@10.32.1 run build
```

浏览器用真实 Dashboard、Vue/Pinia/Element Plus/Leaflet，瓦片替换为本地透明图。覆盖研判、创建/关联/重复、图片、空置信度、地图 Popup、显隐、定位、清除隔离与会话重置，并回归原事件/UAV/GIS 流程。没有本机 Chromium 时会明确跳过。

## 范围限制

纯前端会话 Mock，不接 AI、卫星、真实 UAV 告警、推送、数据库、FastAPI 或其他外部业务服务。研判身份为固定 Mock 研判员，不构成真实审计身份。无自动决策或自动创建事件；create/update Store 接口预留接入适配，当前页面重点提供研判，不扩展通用告警 CRUD 表单。

## 本次文件清单与验证结果

新增14个文件：

- `src/stores/fireAlert.ts`
- `src/views/dashboard/components/map/composables/useAlertMapLayer.ts`
- `public/mock/alert-evidence.svg`
- `src/views/fire/alerts/types.ts`
- `src/views/fire/alerts/config.ts`
- `src/views/fire/alerts/model.ts`
- `src/views/fire/alerts/mock.ts`
- `src/views/fire/alerts/index.vue`
- `src/views/fire/alerts/components/AlertTable.vue`
- `src/views/fire/alerts/components/AlertDetail.vue`
- `src/views/fire/alerts/components/AlertMapSelection.vue`
- `src/views/fire/alerts/alerts.test.mjs`
- `src/views/fire/alerts/testing/browserChecks.mjs`
- `src/views/fire/alerts/README.md`

修改16个文件：

- `src/stores/fireEvent.ts`
- `src/stores/user.ts`
- `src/stores/tenant.ts`
- `src/views/fire/mockMenu.ts`
- `src/views/fire/README.md`
- `src/views/dashboard/index.vue`
- `src/views/dashboard/mock.ts`
- `src/views/dashboard/dashboard.test.mjs`
- `src/views/dashboard/components/DashboardAlerts.vue`
- `src/views/dashboard/components/map/ForestFireMap.vue`
- `src/views/dashboard/components/map/useForestMap.ts`
- `src/views/dashboard/components/map/layers/layerDefinitions.ts`
- `src/views/dashboard/components/map/layers/mapLayerRegistry.ts`
- `src/views/dashboard/components/map/gis-tools.test.mjs`
- `src/views/dashboard/components/map/testing/browser-smoke.test.mjs`
- `src/views/dashboard/components/map/README.md`

无删除文件、无新增依赖。最终执行结果：100项 Node 自动化测试全部通过；Chromium 综合29组 UI 场景和模拟器5组回归通过，无跳过；TypeScript、ESLint、Stylelint、Prettier、Production Build 与 diff 空白检查通过。模拟器浏览器短时回归观察到 Marker 重建0、监听器新增0，不将短时 smoke 声称为十分钟实测。未修改后端，未运行真实设备或外部服务联调，未执行 git commit/push。
