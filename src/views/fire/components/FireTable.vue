<template>
  <ElTable :data="items" row-key="id" class="fire-table">
    <ElTableColumn prop="code" label="编号" min-width="180" />
    <ElTableColumn prop="title" label="标题" min-width="180" show-overflow-tooltip />
    <ElTableColumn label="等级" width="85">
      <template #default="{ row }">
        <span :style="{ color: fireLevelConfig[row.level as FireLevel].color }">
          {{ fireLevelConfig[row.level as FireLevel].label }}
        </span>
      </template>
    </ElTableColumn>
    <ElTableColumn label="状态" width="110">
      <template #default="{ row }">
        <span :style="{ color: fireStatusConfig[row.status as FireStatus].color }">
          {{ fireStatusConfig[row.status as FireStatus].label }}
        </span>
      </template>
    </ElTableColumn>
    <ElTableColumn label="来源" width="130">
      <template #default="{ row }">{{ fireSourceConfig[row.source as FireSource].label }}</template>
    </ElTableColumn>
    <ElTableColumn label="发现时间" min-width="175">
      <template #default="{ row }">{{ fireTime(row.detectedAt) }}</template>
    </ElTableColumn>
    <ElTableColumn label="位置" min-width="200">
      <template #default="{ row }">
        {{
          row.location.address ||
          `${row.location.longitude.toFixed(6)}, ${row.location.latitude.toFixed(6)}`
        }}
      </template>
    </ElTableColumn>
    <ElTableColumn prop="commander" label="负责人" width="120" />
    <ElTableColumn label="操作" fixed="right" width="195">
      <template #default="{ row }">
        <ElButton link type="primary" @click="$emit('detail', row as FireEvent)">详情</ElButton>
        <ElButton link type="primary" @click="$emit('edit', row as FireEvent)">编辑</ElButton>
        <ElButton link type="primary" @click="$emit('locate', row as FireEvent)">定位</ElButton>
      </template>
    </ElTableColumn>
  </ElTable>
</template>
<script setup lang="ts">
import { ElTable, ElTableColumn, ElButton } from "element-plus";
import "element-plus/es/components/table/style/css";
import { fireLevelConfig, fireSourceConfig, fireStatusConfig, fireTime } from "../config";
import type { FireEvent, FireLevel, FireSource, FireStatus } from "../types";
defineProps<{ items: FireEvent[] }>();
defineEmits<{ detail: [event: FireEvent]; edit: [event: FireEvent]; locate: [event: FireEvent] }>();
</script>
