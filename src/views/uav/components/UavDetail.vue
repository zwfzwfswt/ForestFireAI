<template>
  <ElDrawer v-model="open" title="无人机详情 · Mock" size="min(560px, 100%)" append-to-body>
    <template v-if="uav">
      <p>
        {{
          uav.telemetryUpdatedAt
            ? "DEV / MOCK SIMULATOR · 本地模拟遥测，非真实设备"
            : "静态 Mock 快照，尚无模拟遥测"
        }}。载荷能力仅作资产登记。
      </p>
      <ElDescriptions title="基本信息" :column="1" border>
        <ElDescriptionsItem label="名称">{{ uav.name }}</ElDescriptionsItem>
        <ElDescriptionsItem label="ID">{{ uav.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="SN">{{ uav.serialNumber }}</ElDescriptionsItem>
        <ElDescriptionsItem label="型号">{{ uav.model }}</ElDescriptionsItem>
        <ElDescriptionsItem label="所属单位">
          {{ uav.organization || "未填写" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="创建时间">
          {{ formatUavTime(uav.createdAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="更新时间">
          {{ formatUavTime(uav.updatedAt) }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElDescriptions title="状态 / 模拟遥测" :column="1" border>
        <ElDescriptionsItem label="遥测最后更新">
          {{ uav.telemetryUpdatedAt ? formatUavTime(uav.telemetryUpdatedAt) : "暂无模拟遥测" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="状态"><UavStatus :status="uav.status" /></ElDescriptionsItem>
        <ElDescriptionsItem label="最后在线">
          {{ formatUavTime(uav.lastOnlineAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="电量">
          {{ snapshotValue(uav.telemetry.battery, "%") }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="信号">
          {{ snapshotValue(uav.telemetry.signal, "%") }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="速度">
          {{ snapshotValue(uav.telemetry.speed, "m/s") }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="航向">
          {{ snapshotValue(uav.telemetry.heading, "°") }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElDescriptions title="位置（WGS84）" :column="1" border>
        <ElDescriptionsItem label="经度">
          {{ uav.position.longitude.toFixed(6) }}°
        </ElDescriptionsItem>
        <ElDescriptionsItem label="纬度">
          {{ uav.position.latitude.toFixed(6) }}°
        </ElDescriptionsItem>
        <ElDescriptionsItem label="相对起飞点高度">
          {{ snapshotValue(uav.position.altitude, "m") }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElDescriptions title="载荷信息 / 设备能力" :column="1" border>
        <ElDescriptionsItem v-for="(label, key) in payloadLabels" :key="key" :label="label">
          {{ uav.payload[key] ? "已登记支持" : "未配备" }}
        </ElDescriptionsItem>
      </ElDescriptions>
    </template>
    <ElEmpty v-else description="未选中无人机或资产已删除" />
  </ElDrawer>
</template>
<script setup lang="ts">
import { ElDrawer, ElDescriptions, ElDescriptionsItem, ElEmpty } from "element-plus";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/empty/style/css";
import UavStatus from "./UavStatus.vue";
import { formatUavTime, payloadLabels, snapshotValue } from "../config";
import type { Uav } from "../types";
defineProps<{ uav: Uav | null }>();
const open = defineModel<boolean>({ required: true });
</script>
