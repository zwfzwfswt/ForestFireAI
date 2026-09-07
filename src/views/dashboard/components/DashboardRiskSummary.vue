<template>
  <section class="risk-summary" aria-label="当前火险概况">
    <strong>当前火险概况 · MOCK</strong>
    <span>极高风险区：{{ store.extremeRiskCount }} 处</span>
    <span>最高评分：{{ weatherValue(store.maximumScore) }}</span>
    <span>平均评分：{{ weatherValue(store.averageScore) }}</span>
    <span v-if="store.failedCount" role="status">
      {{ store.failedCount }} 处缺测，统计含上次评估
    </span>
    <small>加权演示模型，非行业标准</small>
  </section>
</template>
<script setup lang="ts">
import { useFireRiskStore } from "../../../stores/fireRisk";
import { weatherValue } from "../../environment/model";
const store = useFireRiskStore();
</script>
<style scoped>
.risk-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: center;
  padding: 14px 20px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
}
small {
  color: var(--el-text-color-secondary);
}
</style>
