<template>
  <div class="map-layer-control">
    <label>
      底图
      <select v-model="selected">
        <option v-for="layer in baseLayers" :key="layer.id" :value="layer.id">
          {{ layer.name }}
        </option>
      </select>
    </label>
    <label>
      <input v-model="visible" type="checkbox" />
      显示底图
    </label>
    <small>叠加图层：暂无</small>
  </div>
</template>
<script setup lang="ts">
import { baseLayers } from "./mapConfig";
const selected = defineModel<string>("selected", { required: true });
const visible = defineModel<boolean>("visible", { required: true });
</script>
<style scoped>
.map-layer-control {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
}
select {
  max-width: 100%;
  padding: 5px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
</style>
