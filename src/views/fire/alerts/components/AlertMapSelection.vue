<template>
  <div v-if="store.selectedAlert" class="alert-map-selection">
    <span>
      告警：{{ store.selectedAlert.code }} ·
      {{ alertStatusConfig[store.selectedAlert.status].label }}
    </span>
    <ElButton size="small" @click="store.showDetail(store.selectedAlert.id)">查看告警</ElButton>
    <ElButton size="small" @click="store.select(null)">取消告警选中</ElButton>
  </div>
  <AlertDetail v-if="active" />
</template>
<script setup lang="ts">
import { ref, onActivated, onDeactivated } from "vue";
import { ElButton } from "element-plus";
import { useFireAlertStore } from "../../../../stores/fireAlert";
import { alertStatusConfig } from "../config";
import AlertDetail from "./AlertDetail.vue";
const store = useFireAlertStore();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
</script>
<style scoped>
.alert-map-selection {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 16px;
  font-size: 12px;
}
</style>
