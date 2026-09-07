<template>
  <ElTable :data="items" row-key="id" class="alert-table">
    <ElTableColumn prop="code" label="编号" min-width="180" />
    <ElTableColumn prop="title" label="标题" min-width="170" show-overflow-tooltip />
    <ElTableColumn label="告警类型" width="110">
      <template #default="{ row }">{{ alertTypeConfig[row.type as AlertType].label }}</template>
    </ElTableColumn>
    <ElTableColumn label="等级" width="80">
      <template #default="{ row }">
        <span :style="{ color: alertLevelConfig[row.level as FireLevel].color }">
          {{ alertLevelConfig[row.level as FireLevel].label }}
        </span>
      </template>
    </ElTableColumn>
    <ElTableColumn label="来源" width="130">
      <template #default="{ row }">
        {{ alertSourceConfig[row.source as FireSource].label }}
      </template>
    </ElTableColumn>
    <ElTableColumn label="置信度" width="85">
      <template #default="{ row }">{{ alertConfidence(row.confidence) }}</template>
    </ElTableColumn>
    <ElTableColumn label="状态" width="110">
      <template #default="{ row }">
        <span :style="{ color: alertStatusConfig[row.status as AlertStatus].color }">
          {{ alertStatusConfig[row.status as AlertStatus].label }}
        </span>
      </template>
    </ElTableColumn>
    <ElTableColumn label="发现时间" min-width="170">
      <template #default="{ row }">{{ fireTime(row.detectedAt) }}</template>
    </ElTableColumn>
    <ElTableColumn label="位置" min-width="180">
      <template #default="{ row }">
        {{ row.location.address || `${row.location.longitude}, ${row.location.latitude}` }}
      </template>
    </ElTableColumn>
    <ElTableColumn label="关联火情" min-width="180">
      <template #default="{ row }">
        {{ events.events.find((event) => event.id === row.fireEventId)?.code || "--" }}
      </template>
    </ElTableColumn>
    <ElTableColumn label="操作" fixed="right" width="140">
      <template #default="{ row }">
        <ElButton link type="primary" @click="$emit('detail', row as FireAlert)">研判详情</ElButton>
        <ElButton link type="primary" @click="$emit('locate', row as FireAlert)">定位</ElButton>
      </template>
    </ElTableColumn>
  </ElTable>
</template>
<script setup lang="ts">
import { ElTable, ElTableColumn, ElButton } from "element-plus";
import "element-plus/es/components/table/style/css";
import { useFireEventStore } from "../../../../stores/fireEvent";
import {
  alertTypeConfig,
  alertSourceConfig,
  alertLevelConfig,
  alertStatusConfig,
  alertConfidence,
} from "../config";
import { fireTime } from "../../config";
import type { FireAlert, AlertType, AlertStatus } from "../types";
import type { FireLevel, FireSource } from "../../types";
defineProps<{ items: FireAlert[] }>();
defineEmits<{ detail: [alert: FireAlert]; locate: [alert: FireAlert] }>();
const events = useFireEventStore();
</script>
