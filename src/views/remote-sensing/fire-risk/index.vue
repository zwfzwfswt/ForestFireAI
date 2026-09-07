<template>
  <div class="page-container remote-page risk-page">
    <header>
      <h1>火险分区</h1>
      <p>
        MOCK / DEMO · 高风险 {{ store.highRiskCount }} 处 ·
        使用加权演示模型，非行业标准；风险因子仍为 Mock。
      </p>
    </header>
    <ElCard shadow="never">
      <ElForm inline @submit.prevent>
        <ElFormItem label="搜索">
          <ElInput v-model="keyword" clearable aria-label="火险分区搜索" />
        </ElFormItem>
        <ElFormItem label="风险等级">
          <ElSelect v-model="level" clearable aria-label="风险等级筛选">
            <ElOption
              v-for="(item, key) in riskLevels"
              :key="key"
              :value="key"
              :label="item.label"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <ProductLegend :legend="productConfig.fire_risk.legend" />
      <p>地图中通过“火险等级”业务图层统一控制分区和火险影像的显隐、透明度。</p>
      <ElTable :data="filtered" row-key="id" class="risk-table">
        <ElTableColumn prop="name" label="名称" min-width="180" />
        <ElTableColumn label="等级" min-width="180">
          <template #default="{ row }">
            <span :style="{ color: riskLevels[row.level as RiskLevel].color }">
              {{ riskLevels[row.level as RiskLevel].label }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="score" label="分数 / 100" width="110" />
        <ElTableColumn label="生成时间" min-width="180">
          <template #default="{ row }">{{ fireTime(row.generatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="source" label="来源" min-width="200" />
        <ElTableColumn label="操作" width="140">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail(row.id)">详情</ElButton>
            <ElButton link type="primary" @click="locate(row.id)">地图定位</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <p v-if="error" role="alert">{{ error }}</p>
    </ElCard>
    <RemoteDetail
      v-model="open"
      title="火险分区详情"
      :rows="rows"
      :legend="productConfig.fire_risk.legend"
    >
      <p v-if="store.selectedRiskZone?.assessmentError" role="alert">
        {{ store.selectedRiskZone.assessmentError }}
      </p>
      <FactorBreakdown v-if="store.selectedRiskZone" :factors="store.selectedRiskZone.factors" />
    </RemoteDetail>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onDeactivated } from "vue";
import { useRouter } from "vue-router";
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElTable,
  ElTableColumn,
  ElButton,
} from "element-plus";
import "../styles";
import { useFireRiskStore } from "../../../stores/fireRisk";
import { riskLevels, productConfig } from "../config";
import type { RiskLevel } from "../types";
import FactorBreakdown from "../../environment/components/FactorBreakdown.vue";
import { fireTime } from "../../fire/config";
import ProductLegend from "../components/ProductLegend.vue";
import RemoteDetail from "../components/RemoteDetail.vue";
defineOptions({ name: "FireRiskZones" });
const store = useFireRiskStore(),
  router = useRouter();
const keyword = ref(""),
  level = ref<RiskLevel | "">(""),
  open = ref(false),
  error = ref("");
const filtered = computed(() =>
  store.riskZones.filter(
    (z) =>
      z.name.toLowerCase().includes(keyword.value.trim().toLowerCase()) &&
      (!level.value || z.level === level.value)
  )
);
const rows = computed(() => {
  const z = store.selectedRiskZone;
  return z
    ? [
        { label: "名称", value: z.name },
        { label: "等级", value: riskLevels[z.level].label },
        { label: "风险分数", value: `${z.score}/100` },
        { label: "更新时间", value: fireTime(z.generatedAt) },
        { label: "来源", value: z.source },
      ]
    : [];
});
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
    error.value = "无法打开地图，请重试";
  }
}
watch(
  () => store.sessionVersion,
  () => {
    open.value = false;
    keyword.value = "";
    level.value = "";
  }
);
onDeactivated(() => {
  open.value = false;
});
</script>
