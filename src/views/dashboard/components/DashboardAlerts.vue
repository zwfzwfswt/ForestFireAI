<template>
  <aside class="dashboard-alerts" aria-labelledby="alerts-title">
    <header>
      <h2 id="alerts-title">实时火情 / 告警</h2>
      <span>Mock · {{ alerts.length }} 条</span>
    </header>
    <p class="dashboard-alerts__notice">静态演示数据，未连接实时告警服务；AI 结果需人工复核。</p>
    <div class="dashboard-alerts__list">
      <p v-if="alerts.length === 0">暂无告警</p>
      <article v-for="alert in alerts" :key="alert.id" class="alert-card">
        <div class="alert-card__heading">
          <h3>{{ alert.type }}</h3>
          <span :class="['alert-card__level', { 'alert-card__level--high': alert.level === '高' }]">
            {{ alert.level }}等级
          </span>
        </div>
        <p class="alert-card__area">{{ alert.area }}</p>
        <dl>
          <div>
            <dt>告警时间</dt>
            <dd>{{ alert.time }}</dd>
          </div>
          <div>
            <dt>来源</dt>
            <dd>{{ alert.source }}</dd>
          </div>
          <div>
            <dt>置信度</dt>
            <dd>
              {{
                alert.confidence === null
                  ? "不适用（人工上报）"
                  : `${Math.round(alert.confidence * 100)}%`
              }}
            </dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ alert.status }}</dd>
          </div>
        </dl>
        <details>
          <summary :aria-label="`查看告警 ${alert.id} 详情`">查看详情</summary>
          <div class="alert-card__detail">
            <strong>{{ alert.id }} · Mock 告警详情</strong>
            <p>{{ alert.description }}</p>
          </div>
        </details>
      </article>
    </div>
  </aside>
</template>
<script setup lang="ts">
import type { DashboardAlert } from "../mock";
defineProps<{ alerts: DashboardAlert[] }>();
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
  &__notice {
    font-size: 12px;
    line-height: 1.7;
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
  border-top: 1px solid var(--card-border);
  &__heading {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  &__level {
    font-size: 12px;
    color: var(--el-color-warning);
    &--high {
      color: var(--el-color-danger);
    }
  }
  &__area {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  dl {
    display: grid;
    gap: 8px;
    font-size: 12px;
    div {
      display: grid;
      grid-template-columns: 60px minmax(0, 1fr);
      gap: 8px;
    }
  }
  dt {
    color: var(--el-text-color-secondary);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  summary {
    width: fit-content;
    padding: 6px 0;
    font-size: 13px;
    color: var(--el-color-primary);
    cursor: pointer;
  }
  &__detail {
    padding: 12px;
    font-size: 12px;
    line-height: 1.8;
    background: var(--el-fill-color-light);
    border-radius: 6px;
  }
}
</style>
