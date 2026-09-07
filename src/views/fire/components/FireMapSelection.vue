<template>
  <div v-if="store.selectedEvent" class="fire-map-selection">
    <span>
      火情：{{ store.selectedEvent.code }} · {{ store.selectedEvent.title }} ·
      {{ fireStatusConfig[store.selectedEvent.status].label }}
    </span>
    <ElButton size="small" @click="store.showDetail(store.selectedEvent.id)">查看火情详情</ElButton>
    <ElButton size="small" @click="store.select(null)">取消火情选中</ElButton>
  </div>
  <FireDetail v-if="active" />
</template>
<script setup lang="ts">
import { ref, onActivated, onDeactivated } from "vue";
import { ElButton } from "element-plus";
import { useFireEventStore } from "../../../stores/fireEvent";
import { fireStatusConfig } from "../config";
import FireDetail from "./FireDetail.vue";
const store = useFireEventStore();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
</script>
<style scoped>
.fire-map-selection {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 16px;
  font-size: 12px;
}
</style>
