# ForestFireAI 数据库设计

状态：逻辑模型及首版物理约束草案 v0.1，尚未创建数据库或迁移。与 [产品需求](01-product-requirements.md) 的状态、[API](04-api-design.md) 的字段对应。

## 1. 数据基础约定

采用 PostgreSQL + PostGIS；Redis 不作为事件、命令、资源分配的唯一存储；MinIO 保存二进制文件，数据库记录对象键与完整性信息。

- 新业务主键 `id uuid`，API 序列化为字符串；不要把现有身份接口中的数字 ID 强制改成 UUID。
- SQL 字段 snake_case，API 字段 camelCase；时间统一 `timestamptz`，API 为 UTC ISO 8601。
- 普通业务表默认字段：`id`、`tenant_id bigint`、`created_at`、`updated_at`；可变聚合增加 `version integer NOT NULL DEFAULT 1`，变更时递增。
- `created_by`、`updated_by`、`reviewer_id` 等身份引用为 `varchar(64)`，指向下述 identity_user.id。遥测/消息表由服务写入，不强制填人工身份。
- 单机构也使用固定租户上下文。tenant_id 从认证上下文获取，禁止信任普通请求体租户值。查询强制附带租户过滤；后续可增加数据库 RLS 作为纵深措施。
- 每个被业务外键引用的普通表建立 `UNIQUE(tenant_id,id)`，引用使用复合外键，防止跨租户关联。物理主键仍可为 id。
- 坐标为 EPSG:4326，GeoJSON 顺序 `[longitude,latitude]`；面积/距离用 geography 或明确的米制投影计算，不直接把经纬度差当米。
- 高度单独存 `altitude_m`、`altitude_reference`（AMSL/RELATIVE_HOME/AGL），未知值为 NULL；不可混用不同高度基准。
- 关键关系使用外键；JSONB 用于版本化参数、快照和供应商扩展字段，不替代关系约束。
- 历史事件、命令、证据、分配和审计禁止级联删除。目录实体优先禁用/归档；物理清理按留存任务执行。

下表字段中 `?` 表示可空，其余列出的业务字段必填；默认字段无需逐行重复。状态用 varchar + CHECK，避免首版频繁修改 PostgreSQL 原生 enum。

## 2. 身份兼容与空间基础

仓库只有前端，没有可验证的上游数据库结构。保留旧后端还是实现自有身份服务，需要在后端阶段决定。业务侧统一使用 identity_user 与 tenant 的本地映射：旧服务模式从可信同步导入，不允许客户端自行创建映射；自有身份服务模式由其维护。

| 表 | 核心字段 | 约束 / 用途 |
| --- | --- | --- |
| tenant | id bigint PK、name、status | 单机构预置一条；此表不再带 tenant_id |
| identity_user | id varchar(64)、tenant_id、external_subject、display_name、status | PK(tenant_id,id)，外部 subject 租户内唯一；不保存明文密码 |
| user_region_scope | tenant_id、user_id、region_id | 复合 PK；关联 identity_user、forest_region |
| forest_region | parent_id?、code、name、boundary geometry(MultiPolygon,4326)、status | 租户内 code 唯一，边界有效性校验、GiST 索引 |
| gis_layer | name、kind、service_ref、layer_name?、bounds?、min_zoom、max_zoom、status、style_config jsonb | kind 为 VECTOR/XYZ/WMS/WMTS；服务端白名单解析 service_ref，不保存公开密钥 |

角色、菜单、字典和认证表的完整 DDL 随身份服务方案单独迁移；API 对外继续遵循当前 system 接口。user_region_scope 表达数据范围，不替代操作权限。

## 3. UAV、Telemetry、Mission

| 表 | 核心字段 | 约束 / 关联 |
| --- | --- | --- |
| uav_device | serial_no、name、region_id、model、capabilities jsonb、gateway_ref、enabled | tenant_id + serial_no 唯一；设备健康由遥测提供 |
| telemetry_sample | tenant_id、device_id、boot_id、sequence bigint、observed_at、received_at、position geometry(Point,4326)?、altitude_m?、altitude_reference?、battery_pct?、speed_mps?、heading_deg?、quality jsonb | 特殊时序表，按 received_at 分区；见后文主键与去重 |
| mission_route | name、region_id、status | 航线目录 |
| mission_route_version | route_id、revision integer、path geometry(LineString,4326)、waypoints jsonb、parameters jsonb、checksum | tenant_id + route_id + revision 唯一；发布后不可原地改写 |
| mission | name、type、device_id、route_version_id?、event_id?、status、planned_start_at?、started_at?、ended_at?、parameters jsonb、created_by、version | type=PATROL/VERIFY/SUPPORT；READY 前校验设备能力与必需参数 |
| uav_command | device_id、mission_id?、mission_version?、action、parameters jsonb、payload_hash、status、requested_by、confirmed_by?、confirmed_at?、expires_at、sent_at?、ack_at?、finished_at?、result jsonb?、version | 参数/设备/任务版本绑定到哈希；确认后不可改参数 |

Mission 的 parameters 只保存执行快照；航线编辑生成新 revision。一个任务可以有多次控制命令（执行、取消、返航等），命令回执不能直接等价为任务完成。

遥测区分 boot_id 与 sequence，设备重启序号归零不与旧会话冲突。最新快照以服务验证过的设备会话和 sequence 更新；设备时钟不可信时 quality 标记，不能单凭 observed_at 覆盖快照。

## 4. Media、AI、Remote Sensing

| 表 | 核心字段 | 约束 / 关联 |
| --- | --- | --- |
| media_asset | bucket、object_key、sha256、mime_type、size_bytes、kind、status、captured_at?、device_id?、mission_id?、position?、metadata jsonb | tenant_id + bucket + object_key 唯一；kind=IMAGE/VIDEO/THERMAL/RASTER/REPORT/MODEL；状态 UPLOADING/READY/FAILED/ARCHIVED |
| media_upload | asset_id、provider_upload_id、expires_at、status、parts jsonb | 上传完成后验证分片、大小与摘要；对象验证成功才置 READY |
| media_stream | device_id、provider_ref、protocol、status、last_seen_at? | 播放地址按权限动态签发，不存长期签名 URL |
| job | kind、status、progress、input jsonb、input_hash、attempt、parent_job_id?、requested_by、started_at?、finished_at?、error_code? | kind=AI_INFERENCE/RS_PROCESS/DECISION/LLM_RESPONSE；status=QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED |
| ai_model_version | name、revision、artifact_asset_id、runtime、labels jsonb、metrics jsonb、status、checksum | tenant_id + name + revision 唯一；runtime=PYTORCH/ONNX/TENSORRT |
| ai_detection | job_id、model_version_id、asset_id、frame_time_ms?、label、confidence numeric(5,4)、pixel_geometry jsonb、location geometry(Point,4326)?、location_method?、observed_at | confidence 在 0..1；像素框不等价地图坐标 |
| rs_scene | provider、external_id、acquired_at、cloud_pct?、footprint geometry(MultiPolygon,4326)、source_asset_id、metadata jsonb | tenant_id + provider + external_id 唯一；云量在 0..100 |
| rs_product | scene_id、job_id、kind、asset_id、layer_id?、footprint、algorithm_version、parameters jsonb、published_at?、status | kind 如 NBR/BURN_AREA/THERMAL；发布后可关联 gis_layer |

多景处理通过 `rs_product_scene(tenant_id,product_id,scene_id)` 记录全部输入，rs_product.scene_id 代表主景。输出模型/影像被其他记录引用时禁止物理清理。错误产物不自动作为可用产品发布。

## 5. Fire Alert 与 Fire Event

| 表 | 核心字段 | 约束 / 关联 |
| --- | --- | --- |
| fire_alert | region_id、source_type、source_key、detection_id?、product_id?、title、severity、confidence?、location?、observed_at、status、claimed_by?、claimed_at?、event_id?、duplicate_of?、version | tenant_id + source_type + source_key 唯一防重复采集；REVIEWING 时认领人/时间必填；CONFIRMED 时 event_id 必填 |
| fire_alert_review | alert_id、reviewer_id、outcome、reason、reviewed_at、event_id?、duplicate_of? | 追加记录；outcome=CONFIRMED/DISMISSED/DUPLICATE，后两者必须给理由 |
| fire_event | region_id、event_no、title、severity、status、location geometry(Point,4326)、affected_area geometry(MultiPolygon,4326)?、area_m2?、discovered_at、closed_at?、owner_id?、version | tenant_id + event_no 唯一；location 必须经核实；面积非负 |
| fire_event_log | event_id、actor_id、action、from_status?、to_status?、reason、recorded_at、details jsonb | 追加写入，保留重开和纠错痕迹 |
| fire_alert_media | tenant_id、alert_id、asset_id | 复合 PK 与双向外键，告警可有多个证据 |
| fire_event_media | tenant_id、event_id、asset_id、relation | 复合 PK(event_id,asset_id,tenant_id)，relation 如 EVIDENCE/REPORT |

source_type=MANUAL/AI/REMOTE_SENSING；source_key 由采集服务产生。算法的相近时空去重只给复核建议，不覆盖原始来源。duplicate_of 指向同租户 fire_alert，禁止自引用，服务阻止循环。

确认告警采用事务：锁定或版本校验 alert → 校验/创建 event → 插入 review 与 event_log → 更新 alert → 写 outbox。任一步失败全部回滚。版本竞争只能有一方成功。

## 6. Weather、Emergency Resource、Decision Support、LLM Copilot

| 表 | 核心字段 | 约束 / 关联 |
| --- | --- | --- |
| weather_station | provider、external_id、name、location、region_id、status | 租户内 provider + external_id 唯一 |
| weather_record | station_id、kind、issued_at、valid_at、temperature_c?、humidity_pct?、wind_speed_mps?、wind_direction_deg?、rainfall_mm?、quality jsonb | kind=OBSERVATION/FORECAST；唯一(station_id,kind,issued_at,valid_at,tenant_id) |
| emergency_resource | name、type、region_id、location、capacity numeric、unit、status、contact_ref?、capabilities jsonb、version | type=TEAM/VEHICLE/EQUIPMENT/WATER_POINT；数量非负，敏感联系人分权 |
| resource_allocation | resource_id、event_id、quantity、status、allocated_by、allocated_at、released_at?、version | status=RESERVED/DISPATCHED/RELEASED；数量大于零 |
| decision_plan | event_id、job_id、revision、status、input_snapshot jsonb、input_hash、method_version、recommendations jsonb、limitations、approved_by?、approved_at?、version | status=DRAFT/APPROVED/REJECTED；同事件 revision 唯一；审批锁定版本 |
| knowledge_document | title、asset_id、region_id?、revision、status、access_policy jsonb | 初版使用 PostgreSQL 全文检索；向量索引按后续选型增加 |
| copilot_session | owner_id、event_id?、title、status | 会话所有权 + 数据范围鉴权 |
| copilot_message | session_id、role、content、job_id?、model_ref?、created_by? | role=USER/ASSISTANT；输出保留模型标识 |
| copilot_citation | message_id、document_id?、event_id?、asset_id?、source_version、locator | 三种引用源恰有一个非空；可定位到页码/段落/记录版本 |

天气默认 SI 单位；气象来源缺测用 NULL，不用 0 冒充。分配事务锁 emergency_resource 行，再计算未释放数量，超额请求返回冲突。水源等非消耗资源需按类型定义 capacity/unit，不能把不同单位数量直接相加。

decision_plan.input_snapshot 包含事件版本、天气 record ID、资源版本、图层/产品版本、采样时间和已用规则。批准只修改方案状态，不生成设备控制命令。LLM 引用必须来自权限过滤后的资料，并在访问时再次鉴权。

## 7. 公共可靠性表

| 表 | 字段和约束 |
| --- | --- |
| audit_log | actor_id?、service_actor?、action、entity_type、entity_id、request_id、before/after jsonb、recorded_at；追加写，不记录 Token 和密钥 |
| outbox_event | event_type、aggregate_type、aggregate_id、aggregate_version、payload jsonb、published_at?、attempts；未发布部分索引 |
| idempotency_record | tenant_id、actor_scope、operation、key、request_hash、response_status、response_body、expires_at；唯一(tenant_id,actor_scope,operation,key) |
| ingest_receipt | tenant_id、device_id、boot_id、sequence、received_at；复合 PK 用于跨遥测分区去重 |

控制确认接口与命令 outbox 的生成使用同一事务，并通过唯一业务键阻止同一 command 重复入队。队列恢复后仍校验命令有效期。

## 8. 索引、分区与留存

- 列表常用索引：`(tenant_id,status,created_at DESC,id)`；事件另加 `(tenant_id,region_id,discovered_at DESC)`。
- 空间字段使用 GiST；高选择性租户/区域条件与空间查询组合后通过 EXPLAIN 验证，不能假设任何索引都会生效。
- telemetry_sample 按 received_at 日分区，PK `(tenant_id,device_id,boot_id,sequence,received_at)` 包含分区键。仅此 PK 无法跨分区去重，因此先插 ingest_receipt，同事务成功后写 sample。
- 遥测查询索引 `(tenant_id,device_id,observed_at)`，received_at 可加 BRIN。地图接口不返回完整轨迹，按时间桶/点数上限抽样。
- 初始留存建议：原始遥测 7 天、降采样轨迹 90 天、普通媒体 90 天；关联活动事件的证据禁止到期自动删除。具体期限由业务批准后配置。
- 接收重放窗口暂定 24 小时，ingest_receipt 至少保留 8 天；超出窗口的历史导入使用独立作业，不能绕过去重直接重放。队列过期消息先隔离再人工核对。
- 控制、事件和审计留存期限待确认，不启用自动删除。对象清理先查引用、标归档、经过宽限期再删除，保留清理审计。

## 9. 迁移与测试

建议采用 Alembic 版本化迁移，按身份映射/空间基础、事件告警、设备任务媒体、遥测分区、分析与助手逐步创建。本文不是可执行 DDL，落地迁移必须补齐所有字段类型、复合外键、CHECK 和索引。

迁移验收包括：空库升级、含样例数据升级、可回退迁移降级、不可逆迁移的备份恢复、跨租户外键拒绝、告警并发确认、资源并发占用、遥测跨分区去重、坏几何/空坐标验证，以及数据库和 MinIO 关联恢复。
