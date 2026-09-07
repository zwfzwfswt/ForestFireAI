# 火情事件管理 V1（DEV / MOCK）

统一告警中心已接入，见 [Alert V1](alerts/README.md)。`alertIds` 由 Alert Store 的显式创建/关联动作双向维护；确认告警本身不创建事件。从已确认告警创建时共享本模块创建和状态机，得到已确认事件。

登录后通过动态菜单“火情管理 → 火情事件”访问 `/fire/events`（应用使用 Hash 路由）。本模块仅在内存中保存虚构事件；刷新、退出登录或切换租户恢复十条样例。没有新增依赖、后端请求、AI 检测或实际调度。

## 模型与单一数据来源

- `types.ts`：FireEvent、表单输入、查询条件、Timeline、Action。事件包含身份/编号、标题、等级/状态/来源、WGS84 位置、描述、置信度、来源标识、负责单位/人、生命周期时间和 `alertIds`。
- `config.ts`：八种状态、四种等级、七种来源的文字/颜色/图标/排序，以及集中状态机、处置类型和时间标签。置信度为 0–1，未提供时为 null；时间存 UTC ISO，界面按浏览器时区显示。
- `model.ts`：字段校验、只允许编辑业务字段、组合筛选、UTC 日期编号生成器、状态变更与里程碑时间。编号 `FIRE-YYYYMMDD-NNN` 根据已有编号和会话计数递增，超过三位不截断。
- `mock.ts`：地图默认视角附近十条虚构事件，覆盖全部状态和来源；既有状态通过同一状态机生成对应历史，没有真实告警关联。
- `src/stores/fireEvent.ts`：唯一事件来源，提供创建、编辑、选择、定位、状态变更、Timeline、处置记录、会话重置。组件与地图读取同一份数据，无 Leaflet 对象进入 Pinia。

合法状态链：`suspected → verifying → confirmed → responding → controlled → extinguished → closed`；`suspected` 和 `verifying` 均可转为 `false_alarm`。两个终态均不可回退。新建统一为 suspected；表单不能修改状态、编号或历史。每次合法变更原子更新状态并追加 Timeline，记录前后状态、时间、Mock 操作人和备注。`addTimeline` 是同一受校验的状态变更入口，不允许单独伪造历史。

## 页面与地图

`index.vue` 组合筛选、分页表格、表单和详情；`components/` 分别实现 FireTable、FireForm、FireDetail、FireLocationPicker、FireMapSelection。支持编号/标题/地址/负责人搜索及状态、等级、来源、发现时间范围筛选。详情提供状态流转、时间线、六种人工处置记录，以及告警和媒体/设备/资源关联预留。

地图选点复用 `useForestMap` 与唯一的 `useMapDrawing` Point 工具，在 Dialog 中创建地图会话。新增的可选点完成回调在绘制模式退出后返回归一化坐标，并自动填入表单；取消或关闭销毁地图、绘制结果与监听器。经度允许 ±180°，纬度遵循现有 Web Mercator 支持范围 ±85.05112878°；地址可空，不做地理编码。

`useFireMapLayer.ts` 向现有 Registry 的 **FireEventLayer** 注入 Store 数据工厂，替换 Dashboard 原先两个静态火点。只通过该层子 LayerGroup 管理 Marker，保留原 pane `ff-business-FireEventLayer` / zIndex 620。按事件 ID 复用 Marker；位置、状态、等级或内容编辑后同步更新，关闭事件仍显示“结”符号。符号底色/文字表示状态、边框/罗马数字表示等级。

Popup 显示编号、标题、状态、等级、来源、发现时间和详情按钮；外部文字转义。点击 Marker 同步选中；列表定位跳转 Dashboard、显示 FireEventLayer 并消费定位请求。绘制期间暂停 Popup 和选中，点击传递给 GIS 工具。隐藏、透明度和顺序继续由原业务面板管理；清除 DrawingLayer 不影响火情、UAV、轨迹和风险资源图层。停用时停止监听、销毁图层，激活时从当前 Store 恢复。

## 验证与运行

沿用现有前端启动方式 `pnpm dev`。本模块无需启动后端。

```powershell
corepack.cmd pnpm@10.32.1 exec node --test src/views/fire/fire.test.mjs src/views/uav/uav.test.mjs src/views/uav/telemetry/dataSources.test.mjs src/views/uav/simulator/simulator.test.mjs src/views/dashboard/dashboard.test.mjs src/views/dashboard/components/map/gis-tools.test.mjs
corepack.cmd pnpm@10.32.1 exec node --test --test-concurrency=1 src/views/dashboard/components/map/testing/browser-smoke.test.mjs src/views/uav/testing/simulator-browser.test.mjs
corepack.cmd pnpm@10.32.1 run type-check
corepack.cmd pnpm@10.32.1 exec eslint src/views/fire src/stores/fireEvent.ts src/views/dashboard/components/map/composables/useFireMapLayer.ts
corepack.cmd pnpm@10.32.1 exec stylelint "src/views/fire/**/*.vue"
corepack.cmd pnpm@10.32.1 exec prettier --check src/views/fire src/stores/fireEvent.ts src/views/dashboard/components/map/composables/useFireMapLayer.ts
corepack.cmd pnpm@10.32.1 exec prettier --check --ignore-path .gitignore src/views/fire/README.md
corepack.cmd pnpm@10.32.1 run build
```

自动化测试覆盖 Mock、全部筛选、校验、编号唯一、编辑白名单、合法/非法状态流转、Timeline、Action、地图选点回调、Marker 符号/复用、定位、显隐/透明度、Drawing 隔离和生命周期。Chromium harness 使用真实 Vue、Element Plus、Pinia、Router、Leaflet 与本地透明瓦片，增加五组火情 UI 场景并回归 UAV/GIS。无浏览器时测试会明确跳过；不验证外部瓦片服务。

## 当前限制

数据不持久化，不提供真实权限写入、告警关联服务或消防调度。沿用已登录 Mock 菜单机制，上游已有 `/fire` 路由时不覆盖。事件历史不提供删除功能；关闭保留记录和 Marker。未来接 API 时需要服务端权限、状态并发校验与审计，不能把本次 Mock 操作人当作真实审计身份。
