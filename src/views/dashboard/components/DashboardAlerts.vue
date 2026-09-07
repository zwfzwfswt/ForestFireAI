<template>
  <aside class="dashboard-alerts" aria-labelledby="alerts-title">
    <header>
      <h2 id="alerts-title">待研判告警</h2>
      <span>Mock · 待处理 {{ store.pendingAlerts.length }} 条</span>
    </header>
    <p>仅显示最新 {{ dashboardAlertLimit }} 条新告警或研判中信号；未连接真实告警服务。</p>
    <div class="dashboard-alerts__list">
      <p v-if="!store.dashboardAlerts.length">暂无待处理告警</p>
      <article
        v-for="alert in store.dashboardAlerts"
        :key="alert.id"
        class="alert-card"
        :data-alert-id="alert.id"
      >
        <h3>{{ alertTypeConfig[alert.type].label }} · {{ alert.title }}</h3>
        <p>
          {{ alert.code }} ·
          <span :style="{ color: alertLevelConfig[alert.level].color }">
            {{ alertLevelConfig[alert.level].label }}等级
          </span>
          · {{ alertStatusConfig[alert.status].label }}
        </p>
        <p>
          {{ alert.location.address || alert.location.longitude + ", " + alert.location.latitude }}
        </p>
        <dl>
          <dt>发现时间</dt>
          <dd>{{ fireTime(alert.detectedAt) }}</dd>
          <dt>来源</dt>
          <dd>{{ alertSourceConfig[alert.source].label }}</dd>
          <dt>置信度</dt>
          <dd>{{ alertConfidence(alert.confidence) }}</dd>
        </dl>
        <button type="button" @click="store.showDetail(alert.id)">查看告警 / 研判</button>
      </article>
    </div>
  </aside>
</template>
<script setup lang="ts">
import { useFireAlertStore } from "../../../stores/fireAlert";
import {
  alertTypeConfig,
  alertSourceConfig,
  alertStatusConfig,
  alertLevelConfig,
  alertConfidence,
  dashboardAlertLimit,
} from "../../fire/alerts/config";
import { fireTime } from "../../fire/config";
const store = useFireAlertStore();
</script>
<style scoped lang="scss">
.dashboard-alerts {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: clamp(460px, 65vh, 760px);
  padding: 18px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  header span,
  > p {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  &__list {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
.alert-card {
  padding: 16px 0;
  font-size: 12px;
  overflow-wrap: anywhere;
  border-top: 1px solid var(--card-border);
  h3 {
    margin: 0;
    font-size: 14px;
  }
  dl {
    display: grid;
    grid-template-columns: 60px minmax(0, 1fr);
    gap: 8px;
  }
  dt {
    color: var(--el-text-color-secondary);
  }
  dd {
    margin: 0;
  }
  button {
    padding: 6px 8px;
    color: var(--el-color-primary);
    cursor: pointer;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
  }
}
</style>
