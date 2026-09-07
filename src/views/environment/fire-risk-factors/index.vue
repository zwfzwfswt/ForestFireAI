<template>
  <div class="page-container environment-page factor-page">
    <header>
      <h1>火险因子</h1>
      <p>DEV / MOCK · 值越高，风险贡献越高。演示加权模型不是森林火险行业标准。</p>
    </header>
    <ElCard shadow="never">
      <div class="environment-actions">
        <label>演示观测场景</label>
        <ElSelect
          :model-value="weather.scenario"
          aria-label="演示观测场景"
          @update:model-value="weather.applyScenario($event as WeatherScenario)"
        >
          <ElOption value="baseline" label="区域差异样例" />
          <ElOption value="dry" label="干热强风" />
          <ElOption value="wet" label="湿润降雨" />
        </ElSelect>
        <ElButton type="primary" @click="reassess">重新评估</ElButton>
      </div>
      <p>
        切换场景仅更新 Mock
        观测；点击重新评估后更新风险区。植被、水分、地形、历史因子保留各自样例来源。
      </p>
      <p v-if="message" role="status">{{ message }}</p>
      <ElTable :data="store.riskZones" row-key="id" class="factor-table">
        <ElTableColumn prop="name" label="区域名称" min-width="175" />
        <ElTableColumn prop="score" label="综合评分" width="100" />
        <ElTableColumn label="等级" min-width="160">
          <template #default="{ row }">{{ riskLevels[row.level as RiskLevel].label }}</template>
        </ElTableColumn>
        <ElTableColumn label="主要因子（加权贡献排名）" min-width="300">
          <template #default="{ row }">{{ topText(row.factors) }}</template>
        </ElTableColumn>
        <ElTableColumn label="评估时间（本地）" min-width="175">
          <template #default="{ row }">{{ localTime(row.generatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="评估状态" min-width="180">
          <template #default="{ row }">{{ row.assessmentError || "演示评估完成" }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" fixed="right" width="140">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail(row.id)">因子详情</ElButton>
            <ElButton link type="primary" @click="locate(row.id)">定位</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
    <RemoteDetail v-model="open" title="火险因子详情" :rows="details">
      <FactorBreakdown v-if="store.selectedRiskZone" :factors="store.selectedRiskZone.factors" />
    </RemoteDetail>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onDeactivated } from "vue";
import { useRouter } from "vue-router";
import { ElCard, ElSelect, ElOption, ElButton, ElTable, ElTableColumn } from "element-plus";
import "../styles";
import { useFireRiskStore } from "../../../stores/fireRisk";
import { useWeatherStore } from "../../../stores/weather";
import { riskLevels } from "../../remote-sensing/config";
import type { RiskLevel } from "../../remote-sensing/types";
import type { FireRiskFactors, WeatherScenario } from "../types";
import { rankedFactors, localTime, weatherValue } from "../model";
import FactorBreakdown from "../components/FactorBreakdown.vue";
import RemoteDetail from "../../remote-sensing/components/RemoteDetail.vue";
defineOptions({ name: "EnvironmentFireRiskFactors" });
const store = useFireRiskStore(),
  weather = useWeatherStore(),
  router = useRouter();
const open = ref(false),
  message = ref("");
const topText = (factors: FireRiskFactors) =>
  rankedFactors(factors)
    .slice(0, 3)
    .map((f) => `${f.label} ${weatherValue(f.score)}（贡献${weatherValue(f.contribution)}）`)
    .join(" / ");
const details = computed(() =>
  store.selectedRiskZone
    ? [
        { label: "区域", value: store.selectedRiskZone.name },
        { label: "综合评分", value: store.selectedRiskZone.score },
        { label: "风险等级", value: riskLevels[store.selectedRiskZone.level].label },
        { label: "评估状态", value: store.selectedRiskZone.assessmentError || "演示评估完成" },
      ]
    : []
);
function reassess() {
  const result = store.reassess();
  message.value = `已更新 ${result.updated} 个风险区；${result.failed} 个区域因缺测保留上次评估。`;
}
function detail(id: string) {
  store.select(id);
  open.value = true;
}
async function locate(id: string) {
  try {
    store.locate(id);
    if (await router.push("/dashboard")) throw new Error();
  } catch {
    if (store.locateRequest) store.consumeLocate(store.locateRequest.token);
    message.value = "无法打开地图，请重试";
  }
}
watch(
  () => store.sessionVersion,
  () => {
    open.value = false;
    message.value = "";
  }
);
onDeactivated(() => {
  open.value = false;
});
</script>
