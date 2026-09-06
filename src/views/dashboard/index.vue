<template>
  <div class="command-center">
    <header class="command-header">
      <div>
        <p>ForestFireAI · 森林防火智能监测指挥中心</p>
        <h1>森林防火智能监测预警与决策支持系统</h1>
        <p>态势总览 / 巡检监测 / 告警复核</p>
      </div>
      <div class="command-header__status">
        <span>Mock 演示模式 · 未连接真实设备</span>
        <small>数据快照：{{ dashboardSnapshot }}</small>
      </div>
    </header>
    <DashboardStats :items="dashboardStats" />
    <div class="command-center__main">
      <DashboardMapPlaceholder />
      <DashboardAlerts :alerts="dashboardAlerts" />
    </div>
  </div>
</template>

<script setup lang="ts">
import DashboardStats from "./components/DashboardStats.vue";
import DashboardMapPlaceholder from "./components/DashboardMapPlaceholder.vue";
import DashboardAlerts from "./components/DashboardAlerts.vue";
import { dashboardAlerts, dashboardSnapshot, dashboardStats } from "./mock";
defineOptions({ name: "Dashboard", inheritAttrs: false });
</script>

<style scoped lang="scss">
.command-center {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  padding: 20px;
  container-type: inline-size;
  color: var(--el-text-color-primary);
  background: var(--page-bg);
}
.command-header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--card-border);
  border-top: 3px solid var(--el-color-success);
  border-radius: var(--card-radius);
  h1 {
    margin: 8px 0;
    font-size: clamp(20px, 2vw, 28px);
    line-height: 1.4;
  }
  p {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  &__status {
    display: grid;
    gap: 8px;
    font-size: 13px;
    color: var(--el-color-warning);
    small {
      color: var(--el-text-color-secondary);
    }
  }
}
.command-center__main {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  min-height: 460px;
}
@container (max-width: 900px) {
  .command-center__main {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 600px) {
  .command-center {
    padding: 12px;
  }
}
</style>
