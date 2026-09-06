<template>
  <section class="dashboard-stats" aria-label="森林防火统计（Mock）">
    <article v-for="item in items" :key="item.label" class="stat">
      <h2>{{ item.label }}</h2>
      <p>
        <strong>{{ item.value }}</strong>
        <span>{{ item.unit }}</span>
      </p>
      <small>{{ item.note }}</small>
    </article>
  </section>
</template>
<script setup lang="ts">
import type { DashboardStat } from "../mock";
defineProps<{ items: DashboardStat[] }>();
</script>
<style scoped lang="scss">
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.stat {
  padding: 18px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
  p {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin: 12px 0;
    color: var(--el-color-primary);
  }
  strong {
    font-size: 32px;
    line-height: 1;
  }
  small {
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }
}
@container (max-width: 900px) {
  .dashboard-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@container (max-width: 560px) {
  .dashboard-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
