<template>
  <span class="uav-status" :style="{ color: uavStatuses[status].color }">
    <span aria-hidden="true">{{ uavStatuses[status].glyph }}</span>
    {{ uavStatuses[status].label }}
  </span>
</template>
<script setup lang="ts">
import { uavStatuses } from "../config";
import type { UavStatus } from "../types";
defineProps<{ status: UavStatus }>();
</script>
<style scoped>
.uav-status {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-weight: 600;
}
</style>
