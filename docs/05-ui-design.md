# ForestFireAI UI 设计

状态：交互与页面结构草案 v0.1，尚未创建页面或修改样式。依据 [产品需求](01-product-requirements.md)、[API](04-api-design.md) 和当前布局实现。

## 1. 现有 UI 的延续

沿用 Vue 3、Element Plus、UnoCSS/SCSS、主题变量、图标、Breadcrumb、TagsView 和通知入口。普通列表参考 `src/views/system/user/index.vue` 的页面结构，复用 `usePageTable`、`useTableSelection`；统计复用 `src/components/ECharts/index.vue`。

默认使用 LeftLayout，以便让地图获得稳定空间。已有 Top/Mix/Double 保留，新增页面仍需验证容器适配。地图工作台是普通动态路由下的业务页面，不在布局根节点写森林业务。

Dashboard 保留 `/dashboard`、Dashboard 路由名称与固定标签；未来经任务授权替换内容，展示火情、告警、设备和任务概览。现有模板页、系统管理和演示菜单本次不修改。

## 2. 菜单、路由与页面映射

以下均为未来的后端动态菜单。顶层目录 component=Layout，子项使用相对 path（如 overview）；组件字符串精确匹配 `src/views/<component>.vue`。

| 模块 | 主路由 / 唯一路由名 | component | 主页面内容 |
| --- | --- | --- | --- |
| GIS | /gis/overview / GisOverview | gis/overview/index | 综合监测一张图 |
| UAV | /uav/devices / UavDevices | uav/devices/index | 设备列表、健康、控制入口 |
| Telemetry | /telemetry/live / TelemetryLive | telemetry/live/index | 遥测指标、实时轨迹与历史回放 |
| Mission | /mission/list / MissionList | mission/list/index | 巡检/复核任务、航线版本 |
| Media | /media/library / MediaLibrary | media/library/index | 图片、视频、热红外与证据库 |
| Fire Event | /fire-event/list / FireEventList | fire-event/list/index | 活动/历史火情和处置时间线 |
| Fire Alert | /fire-alert/list / FireAlertList | fire-alert/list/index | 待复核队列、误报与重复记录 |
| AI | /ai/detections / AiDetections | ai/detections/index | 检测结果、模型及推理作业入口 |
| Remote Sensing | /remote-sensing/scenes / RemoteSensingScenes | remote-sensing/scenes/index | 影像目录、产品和处理作业 |
| Weather | /weather/overview / WeatherOverview | weather/overview/index | 实测/预报、站点、时效状态 |
| Emergency Resource | /emergency-resource/list / EmergencyResourceList | emergency-resource/list/index | 队伍、车辆、水源、装备及占用 |
| Decision Support | /decision-support/plans / DecisionSupportPlans | decision-support/plans/index | 方案生成、对比与审批 |
| LLM Copilot | /llm-copilot/chat / LlmCopilotChat | llm-copilot/chat/index | 有来源的问答与草稿 |

模块入口可按值班角色排序，不必把所有二级页面常驻一级菜单。没有权限时后端不返回对应菜单。隐藏详情页例如 `/fire-event/detail/:id`，component=`fire-event/detail/index`、name=`FireEventDetail`、meta.hidden=true、activeMenu=`/fire-event/list`。

动态路由中的 `meta.roles` 不能替代后端过滤。详情页虽 hidden 仍需鉴权。当前菜单搜索未统一按 hidden 排除所有页面，新增动态参数详情需在该功能任务中测试搜索行为。

## 3. GIS 工作台

```text
┌────────系统导航 / 页签 / 当前连接状态─────────────────────────┐
│ 林区选择  时间范围  图层管理  搜索位置  测量  全屏             │
├───────────┬─────────────────────────┬───────────────────────┤
│ 图层树    │                         │ 告警/选中对象面板      │
│ 林区      │ Leaflet 地图             │ 严重程度与时间         │
│ 无人机    │ 火情、轨迹、资源、影像    │ 证据缩略图             │
│ 火情      │                         │ 查看详情 / 复核        │
│ 遥感产品  │                         │                       │
├───────────┴─────────────────────────┴───────────────────────┤
│ 图例 / 比例尺 / 坐标与数据来源 / 数据时间或回放时间           │
└─────────────────────────────────────────────────────────────┘
```

左侧图层树和右侧详情面板可以收起。地图承担定位与态势；复杂编辑进入抽屉/详情页。点击 UAV、火情和资源使用相同的 entityType/entityId 选中模型，面板根据类型渲染。

地图组件建议拆分为 GisMapContainer、MapLayerTree、MapLegend、MapToolbar、FeatureDetailPanel；实例和图层更新由 `composables/gis` 管理。容器填满 LayoutMain 可用高度，页面局部禁用多余滚动，不能再叠加 100vh。

侧栏、全屏、ResizeObserver 和 KeepAlive 激活后触发尺寸更新。高频位置更新只移动现有图形，不逐帧销毁重建地图。主题切换不通过整页反色改变遥感影像或热红外图例。

## 4. 核心页面交互

| 页面 | 内容和动作 | 必须呈现的状态 |
| --- | --- | --- |
| Dashboard | 未关闭事件、待复核告警、在线 UAV、执行中任务；趋势与快捷入口 | 数据时间、加载失败；无数据不显示虚构统计 |
| UAV | 台账表格/卡片、设备详情、能力、电量、关联任务 | 在线/离线/禁用/遥测过期分别表达 |
| Telemetry | 位置、速度、高度基准、方向、电池；时间轴轨迹 | 实时与回放明显区分，断线保留最后数据并标过期 |
| Mission | 任务筛选、新建、航线编辑、版本、执行日志 | DRAFT 可编辑，READY 冻结，EXECUTING 不直接改航点 |
| Media | 网格/列表、任务时间筛选、预览、证据关联 | 上传进度、处理失败、文件不可用、权限不足 |
| Fire Alert | 默认待复核，按严重程度/时间/来源筛选；认领后复核 | 显示置信度、位置可信度、原始证据、重复关系 |
| Fire Event | 详情含地图、证据、告警、任务、资源、方案、时间线 | 状态与严重程度独立，重开必须填写理由 |
| AI | 原图/检测框对照、模型版本、推理作业进度 | 未定位检测不在地图上伪造点位；置信度不是火情确认 |
| Remote Sensing | 场景筛选、覆盖范围、云量、产品对比、发布 | 采集与处理时间、算法版本、缺景/处理失败 |
| Weather | 站点图层、趋势图、预报时间选择 | 观测/预报标签，发布时间与有效时间，缺测不记为零 |
| Emergency Resource | 按距离/能力筛选、资源数量、预留、释放 | 占用详情、版本冲突、不同单位不能汇总相加 |
| Decision Support | 输入快照、方案对比、依据、限制、批准/拒绝 | 过时输入警示，批准后显示“已批准，尚未执行” |
| LLM Copilot | 事件上下文、回答、来源、报告草稿 | 生成中/失败/无依据；引用权限失效不显示资料 |

## 5. 人工确认交互

飞控操作统一经过“核对 → 明确确认 → 执行状态”流程。确认弹窗显示设备名称与 ID、动作、任务版本、航线摘要、关键参数、遥测时间、确认有效期。

用户打开弹窗不代表批准。只有点击明确标记的确认按钮才调用命令 confirm API；普通消息提示框或 LLM 回复不能充当确认。参数或设备状态变化后提示重新核对，不默认勾选新参数。

确认提交期间禁用重复点击；超时先查询 command 状态。UNKNOWN 显示“结果待核实”，引导查看设备实际状态，不能自动重发。ACKNOWLEDGED 显示“设备已接收”，SUCCEEDED 才显示操作成功。

Fire Alert 确认弹窗提供“新建事件”与“关联已有事件”；误报和重复要求理由。与无人机控制确认采用不同业务组件，避免复核告警误触飞行。

## 6. 视觉、缓存与状态管理

- 延续 `styles/theme.scss`、Element Plus 变量和页面间距，不另建完整主题系统。
- LOW/MEDIUM/HIGH/CRITICAL 使用不同图形、标签和文字，颜色只是辅助；业务颜色不随任意主题主色改变语义。
- 普通列表允许 keepAlive；地图、直播、Telemetry 首版默认 keepAlive=false。后续缓存需证明停用后不持续消耗连接和绘制资源。
- 当前 LayoutMain 按 fullPath 缓存，不能把逐秒变化的时间范围持续写进 query 导致大量缓存。查询状态保存在局部或受限 Store。
- 身份或租户切换清理业务缓存与订阅；刷新后重新鉴权。地图/媒体实例不放 Pinia。
- 所有页面覆盖 loading、empty、error、stale、forbidden、conflict；错误可重试，但危险命令重试遵循查询状态流程。
- PC 验收宽度先覆盖 1366/1920；窄屏改为面板抽屉，不承诺首版移动飞控操作。

## 7. UI 验收

关键验收：登录后菜单正确、无权限入口不可见且直接 URL 不越权、列表分页保持、详情返回激活父菜单、地图侧栏变化正确、回放与实时不混淆、重复确认只产生一条命令、过期参数无法确认、告警复核冲突可理解、LLM 来源可打开、断网后提示与恢复一致。

界面测试与业务测试采用路线图中的工具方案；新增组件时先检查自动导入和 `types/components.d.ts` 的当前策略，不假定声明自动生成。
