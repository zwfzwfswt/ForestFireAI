<template>
  <div v-if="store.selectedUav" class="uav-map-selection">
    <span>已选中：{{ store.selectedUav.name }} · Mock</span>
    <UavStatus :status="store.selectedUav.status" />
    <button type="button" @click="open = true">查看无人机详情</button>
    <button type="button" @click="store.select(null)">取消选中</button>
  </div>
  <UavDetail v-if="open" v-model="open" :uav="store.selectedUav" />
</template>
<script setup lang="ts">
import { ref, onDeactivated, watch } from "vue";
import { useUavStore } from "../../../stores/uav";
import UavDetail from "./UavDetail.vue";
import UavStatus from "./UavStatus.vue";
const store = useUavStore();
const open = ref(false);
onDeactivated(() => {
  open.value = false;
});
watch(
  () => store.selectedUav,
  (uav) => {
    if (!uav) open.value = false;
  }
);
</script>
<style scoped>
.uav-map-selection {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 16px;
  font-size: 12px;
}
button {
  padding: 5px 8px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
</style>
