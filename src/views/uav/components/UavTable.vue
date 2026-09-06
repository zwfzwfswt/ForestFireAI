<template>
  <ElTable
    :data="items"
    row-key="id"
    :current-row-key="selectedId ?? undefined"
    highlight-current-row
    border
    empty-text="没有符合条件的无人机"
    @row-click="(row: Uav) => emit('select', row.id)"
  >
    <ElTableColumn prop="name" label="名称" min-width="155" show-overflow-tooltip />
    <ElTableColumn prop="model" label="型号" min-width="150" show-overflow-tooltip />
    <ElTableColumn prop="serialNumber" label="SN" min-width="165" show-overflow-tooltip />
    <ElTableColumn label="状态" min-width="115">
      <template #default="{ row }"><UavStatus :status="row.status" /></template>
    </ElTableColumn>
    <ElTableColumn label="电量" min-width="100">
      <template #default="{ row }">{{ snapshotValue(row.telemetry.battery, "%") }}</template>
    </ElTableColumn>
    <ElTableColumn label="信号" min-width="100">
      <template #default="{ row }">{{ snapshotValue(row.telemetry.signal, "%") }}</template>
    </ElTableColumn>
    <ElTableColumn label="高度（m）" min-width="110">
      <template #default="{ row }">{{ snapshotValue(row.position.altitude, "m") }}</template>
    </ElTableColumn>
    <ElTableColumn label="最后在线时间" min-width="220">
      <template #default="{ row }">{{ formatUavTime(row.lastOnlineAt) }}</template>
    </ElTableColumn>
    <ElTableColumn label="操作" fixed="right" width="230">
      <template #default="{ row }">
        <ElButton link type="primary" @click.stop="emit('detail', row as Uav)">详情</ElButton>
        <ElButton link type="primary" @click.stop="emit('locate', row as Uav)">定位</ElButton>
        <ElButton link type="primary" @click.stop="emit('edit', row as Uav)">编辑</ElButton>
        <ElButton link type="danger" :disabled="deleting" @click.stop="emit('delete', row as Uav)">
          删除
        </ElButton>
      </template>
    </ElTableColumn>
  </ElTable>
</template>
<script setup lang="ts">
import { ElTable, ElTableColumn, ElButton } from "element-plus";
import "element-plus/es/components/table/style/css";
import "element-plus/es/components/button/style/css";
import UavStatus from "./UavStatus.vue";
import { snapshotValue, formatUavTime } from "../config";
import type { Uav } from "../types";
defineProps<{ items: Uav[]; selectedId: string | null; deleting: boolean }>();
const emit = defineEmits<{
  select: [id: string];
  detail: [uav: Uav];
  edit: [uav: Uav];
  delete: [uav: Uav];
  locate: [uav: Uav];
}>();
</script>
