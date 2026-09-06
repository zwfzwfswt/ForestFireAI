# ForestFireAI API 设计

状态：契约草案 v0.1。除“现有接口兼容”外，本文端点均为规划，当前未实现。实体见 [数据库设计](03-database-design.md)，用户流程见 [产品需求](01-product-requirements.md)。

## 1. HTTP 通用契约

所有下列路径均相对 `/api/v1`。开发请求示例 `/dev-api/api/v1/fire-alerts`，生产当前前端前缀为 `/prod-api`；代理去除前缀，不能重复添加版本路径。

JSON 请求/响应采用 camelCase；UUID 与业务 ID 为字符串，身份接口保留现有数字型字段兼容性。时间 UTC ISO 8601，几何 EPSG:4326 GeoJSON，经度在前。普通分页 `pageNum=1&pageSize=20`，pageSize 最大 100，排序使用服务端字段白名单。

成功 JSON（包括删除）均返回响应壳，不使用无响应体的 204，以适配现有 Axios 解包：

```json
{
  "code": "00000",
  "data": { "list": [], "total": 0 },
  "msg": "成功"
}
```

创建返回 HTTP 201，异步作业返回 202，业务更新返回 200，均使用 code=00000。普通请求由 `src/utils/request.ts` 统一解包；Blob 下载继续返回原始 Axios response。

| HTTP | code | 含义 |
| --- | --- | --- |
| 401 | A0230 | Access Token 失效，触发现有单飞刷新 |
| 401 | A0231 | Refresh Token 失效，结束会话 |
| 403 | A0301 | 权限不足，兼容现有权限刷新行为 |
| 404 | B0404 | 资源不存在或不应暴露其存在 |
| 409 | B0409 | version 冲突、资源已占用、非法状态或幂等键冲突 |
| 422 | B0422 | 字段校验失败；FastAPI 默认错误需转换成统一壳 |
| 429 | B0429 | 频率限制，附 Retry-After |
| 503 | B0503 | 依赖/设备服务不可用 |

错误壳仍为 `{code,data,msg}`，data 可带 `{fieldErrors,currentVersion}`。`X-Request-ID` 返回追踪标识。现有拦截器只有非 2xx 分支处理 Token/权限错误，因此不可用 HTTP 200 承载 A0230/A0231。

当前拦截器会把结构化错误转为普通 Error；未来冲突处理页面需要在对应 API 基础任务中保留错误详情并测试，此文档不修改封装。

## 2. 认证、权限和并发

- 普通 HTTP 使用 `Authorization: Bearer <accessToken>`；用户、租户、设备范围从服务端会话推导。
- 操作权限沿用 `领域:资源:动作`，例如 `fire:alert:review`、`uav:command:confirm`。数据权限覆盖列表、详情、下载、图层和实时订阅。
- 可变聚合请求带 `version`；事务更新条件包含旧版本，不匹配返回 409。
- 创建事件、告警复核、控制确认、资源分配、作业创建要求 `Idempotency-Key`。同用户、操作、key 和相同请求返回首次结果；不同请求哈希返回 409。
- 普通幂等响应缓存建议 24 小时；命令记录长期保留且确认只能消费一次，缓存过期也不能重新执行已确认命令。
- 所有危险控制确认由已认证人员操作；LLM 和后台自动作业身份不可调用控制确认端点。

## 3. 现有接口兼容

首先兼容 `src/api/auth`、`src/api/system` 及用户/菜单 Store 的调用：

| 方法 / 路径 | 契约 |
| --- | --- |
| POST /auth/login | username、password、captchaId、captchaCode、tenantId?；返回 accessToken、refreshToken、tokenType、expiresIn |
| POST /auth/refresh-token | 当前客户端通过 query 传 refreshToken，Authorization=no-auth；服务端/代理不得记录敏感查询值，后续改 body 需同步客户端 |
| DELETE /auth/logout | 注销会话 |
| GET /auth/captcha | captchaId、captchaBase64 |
| GET /users/me | userId、username、nickname、avatar、roles[]、perms[]、canSwitchTenant? |
| GET /menus/routes | 已授权 RouteItem[]，component 对应 src/views，顶层目录 component=Layout |
| GET /sse/connect | 现有 fetch SSE，继续系统通知和字典主题 |

系统用户、角色、部门、菜单、字典、公告、日志、文件和可选租户等其余接口以当前 `src/api/` 为兼容清单，不在此虚构已实现的 FastAPI 后端。扫码登录若保留需覆盖 `/auth/qr-code/*`。

## 4. 业务端点目录

下表列出每个模块的首版端点；只读 endpoint 使用相应 list/view 权限，状态变更需专门操作权限。不提供通用任意字段修改状态的接口。

| 模块 | 方法 / 路径 | 输入、输出和权限重点 |
| --- | --- | --- |
| GIS | GET /gis/regions；GET /gis/layers | 林区/图层授权目录，gis:layer:view |
| GIS | GET /gis/features | bbox、layerIds、from?、to?、limit≤5000；data={type:FeatureCollection,features,truncated} |
| UAV | GET /uavs；GET /uavs/{id}；POST /uavs；PATCH /uavs/{id} | 设备台账；更新带 version，仅允许元数据，不能隐式控制 |
| UAV | POST /uavs/{id}/commands；GET /uav-commands/{id} | 创建待确认请求 / 查询结果；uav:command:request |
| UAV | POST /uav-commands/{id}/confirm | 人工确认并异步下发；uav:command:confirm |
| Telemetry | GET /uavs/{id}/telemetry/latest | snapshot、observedAt、receivedAt、stale、quality |
| Telemetry | GET /uavs/{id}/telemetry/track | from、to、maxPoints≤5000；单次时间范围≤24小时，返回抽样说明 |
| Mission | GET /missions；POST /missions；GET /missions/{id}；PATCH /missions/{id} | PATROL/VERIFY/SUPPORT；PATCH 只改 DRAFT |
| Mission | POST /missions/{id}/ready | version；验证/冻结任务参数，返回 READY；不执行飞行 |
| Mission | GET /mission-routes；POST /mission-routes；POST /mission-routes/{id}/versions | 创建目录和不可变航线版本；mission:route:write |
| Media | GET /media；GET /media/{id} | 元数据目录与详情 |
| Media | POST /media/uploads；POST /media/uploads/{id}/complete | 申请分片上传会话 / 提交分片校验，返回资产 |
| Media | GET /media/{id}/access；GET /uavs/{id}/media-stream | 返回短效地址、expiresAt、protocol；media:asset:view |
| Fire Event | GET /fire-events；POST /fire-events；GET /fire-events/{id} | 列表/人工新建/详情，必须有已核实坐标；fire:event:create |
| Fire Event | POST /fire-events/{id}/transitions；GET /fire-events/{id}/timeline | version、targetStatus、reason；服务端验证状态，fire:event:transition |
| Fire Alert | GET /fire-alerts；POST /fire-alerts；GET /fire-alerts/{id} | 人工线索及检索；AI/遥感从服务内部生成 |
| Fire Alert | POST /fire-alerts/{id}/claim；POST /fire-alerts/{id}/reviews | 认领/复核；fire:alert:review |
| AI | GET /ai/models；POST /ai/models；GET /ai/detections | 模型版本目录、注册和结果查询；ai:model:create |
| AI | POST /ai/inference-jobs | assetId、modelVersionId、parameters；返回 jobId，ai:inference:create |
| Remote Sensing | GET /remote-sensing/scenes；POST /remote-sensing/scenes | 授权影像目录/登记；rs:scene:create |
| Remote Sensing | POST /remote-sensing/processing-jobs；GET /remote-sensing/products | sceneIds、algorithm、parameters；异步处理 |
| Remote Sensing | POST /remote-sensing/products/{id}/publish | version、图层样式；rs:product:publish |
| Weather | GET /weather/stations；GET /weather/records | regionId/stationId、kind、from、to；观测与预报分开 |
| Emergency Resource | GET /emergency-resources；POST /emergency-resources；PATCH /emergency-resources/{id} | 台账和 version；resource:asset:write |
| Emergency Resource | POST /resource-allocations；POST /resource-allocations/{id}/release | eventId、resourceId、quantity、version；resource:allocation:create/release |
| Decision Support | POST /decision-support/plans；GET /decision-support/plans/{id} | eventId、eventVersion、parameters；202 作业，decision:plan:create |
| Decision Support | POST /decision-support/plans/{id}/review | version、outcome=APPROVED/REJECTED、reason；decision:plan:review |
| LLM Copilot | POST /copilot/sessions；GET /copilot/sessions/{id}/messages | 建立会话/读取历史，copilot:session:use |
| LLM Copilot | POST /copilot/sessions/{id}/messages | content、eventId?；202 返回 messageId/jobId，不执行控制 |
| 公共 | GET /jobs/{id}；POST /jobs/{id}/cancel | 检查关联领域权限；取消计算作业不等同取消无人机任务 |
| 公共 | POST /realtime/tickets；GET /realtime/snapshot | 建立 WS 一次性票据、获取授权主题快照及 cursor |

bbox 使用 `west,south,east,north`；首版不接受跨日期变更线范围，需拆为两个查询。GIS 业务几何在 JSON data 中，图像切片由经鉴权网关返回二进制，不经过普通响应壳。

## 5. 告警复核契约

POST `/fire-alerts/{id}/claim` 带 version，使 NEW 变 REVIEWING 并记录认领人；重复认领使用冲突提示。主管重新分派需独立授权任务实现。

POST `/fire-alerts/{id}/reviews` 示例：

```json
{
  "version": 2,
  "outcome": "CONFIRMED",
  "reason": "值班员核对航拍图像和地理位置",
  "newEvent": {
    "title": "示例林区疑似明火核实",
    "regionId": "11111111-1111-4111-8111-111111111111",
    "severity": "HIGH",
    "location": { "type": "Point", "coordinates": [116.3, 40.2] }
  }
}
```

CONFIRMED 时 `eventId` 与 `newEvent` 恰有一个；DISMISSED 时二者为空；DUPLICATE 时提供 duplicateOf，不能指向自身。复核响应 data 为 `{alertId,status,eventId,version}`，确认与事件创建原子提交。

新事件 discoveredAt 默认为告警 observedAt；直接 POST /fire-events 时必须提供 discoveredAt。确认已有事件也记录关联日志，不覆盖事件原始发现时间。

## 6. 控制请求与人工确认

POST `/uavs/{id}/commands`：

```json
{
  "action": "START_MISSION",
  "missionId": "22222222-2222-4222-8222-222222222222",
  "missionVersion": 3,
  "parameters": {},
  "reason": "核实已确认火情"
}
```

返回 `{id,status:"PENDING_CONFIRMATION",payloadHash,expiresAt,version}`。action 为白名单 START_MISSION/CANCEL_MISSION/ARM/TAKEOFF/LAND/RETURN_HOME/SET_MODE/UPLOAD_ROUTE；必需参数由设备能力和对应 action schema 校验。

POST `/uav-commands/{id}/confirm` 携带 `{version,payloadHash,confirmed:true}` 和 Idempotency-Key。服务端从会话记录 confirmedBy，不能由请求伪造身份。有效期初始建议 60 秒，可配置；过期需重新申请确认。

确认事务检查命令待确认、设备授权、参数哈希、任务版本、遥测时效和设备联锁，再产生 outbox，返回 202 和 commandId。任何条件变化返回 409，不能自动“帮用户”接受新参数。

命令状态与 [产品状态机](01-product-requirements.md) 一致。GET 命令返回 ackAt/finishedAt、result 和 UNKNOWN 原因；通过 WS 接收更新。不提供“重复点击立即再飞一次”的重试语义。

## 7. WebSocket 和 MQTT

浏览器先以 Bearer 调 POST /realtime/tickets 获得 30 秒有效的一次性 ticket，再连接 `/api/v1/realtime/ws`（同样经过部署代理前缀）。握手后 5 秒内发送 `{type:"auth",ticket}`，认证前禁止订阅；无需把长期 Token 放进 URL。票据消费、Origin 检查、过期会话断开和主题权限检查由服务端完成。

消息示例：

```json
{
  "schemaVersion": 1,
  "messageId": "33333333-3333-4333-8333-333333333333",
  "topic": "fire-alert.updated",
  "entityId": "44444444-4444-4444-8444-444444444444",
  "entityVersion": 3,
  "occurredAt": "2026-09-06T08:00:00Z",
  "cursor": "opaque-cursor",
  "data": { "status": "CONFIRMED" }
}
```

主题：`telemetry.updated`、`fire-alert.updated`、`fire-event.updated`、`mission.updated`、`command.updated`、`job.updated`、`copilot.delta`。使用 subscribe/unsubscribe 消息指定主题和设备/区域，服务端逐项鉴权，拒绝通配越权订阅。

关键业务消息可按 cursor 重放，重放保留初始建议 24 小时；超出窗口返回 resync_required。客户端获取带水位的快照再订阅该 cursor 之后的消息，按 messageId 和 entityVersion 去重。遥测采用最新快照恢复，允许丢弃中间帧；Copilot delta 不保证重放，最终文本从持久化消息接口获取。

MQTT Topic 建议：`forestfire/v1/{tenantId}/uavs/{deviceId}/telemetry`、`.../commands`、`.../command-results`。遥测包含 bootId、sequence、observedAt 和带单位字段；Broker 根据设备凭据绑定范围，不能信任 payload 中自报的 tenantId。

QoS 1 消息由消费者幂等；控制 Topic 禁止 retained 消息，设置消息有效期。设备网关只接受已确认命令，结果携带 commandId 和阶段。MQTT PUBACK 不能当作设备完成回执。

## 8. 文件与测试约束

MinIO 对象默认私有；下载和播放短效地址按用户范围签发。文件传输不对外部存储注入系统 Bearer Token，使用独立传输客户端；禁止把任意第三方 URL 交给现有带 Token 的 FileAPI.download。

上传 complete 验证资产所有权、分片、大小和 MIME，未验证成功不可进入 AI 推理。长任务返回 jobId 并查询进度，不等待超过当前 50 秒 Axios 超时。

契约测试覆盖：响应壳、分页、HTTP 与业务码对应、越权、ID 类型兼容、version 冲突、幂等复用、人工确认过期/参数变化、重复 MQTT、断线快照恢复、文件授权、LLM 越权检索及控制拒绝。
