<template>
  <div class="product-legend" :aria-label="`${legend.label}图例`">
    <strong>{{ legend.label }} · MOCK</strong>
    <span v-for="stop in legend.stops" :key="stop.label">
      <i :style="{ backgroundColor: stop.color }"></i>
      {{ stop.label }}
    </span>
  </div>
</template>
<script setup lang="ts">
import type { Legend } from "../types";
defineProps<{ legend: Legend }>();
</script>
<style scoped>
.product-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
  font-size: 12px;
}
span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}
i {
  display: inline-block;
  width: 22px;
  height: 12px;
  border: 1px solid var(--el-border-color);
}
</style>
