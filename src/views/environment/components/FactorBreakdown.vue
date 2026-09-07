<template>
  <section class="factor-breakdown">
    <h3>风险解释 · 八项因子</h3>
    <p>因子值越高，风险贡献越高。按“因子分 × 权重”的贡献分排名；均为 MOCK / DEMO。</p>
    <ol>
      <li v-for="factor in ranking.slice(0, 3)" :key="factor.key">
        {{ factor.label }}：{{ weatherValue(factor.score) }} / 100 · 贡献
        {{ weatherValue(factor.contribution) }} 分
      </li>
    </ol>
    <ElTable :data="ranking" row-key="key">
      <ElTableColumn prop="label" label="风险因子" width="110" />
      <ElTableColumn label="因子分 / 100" width="110">
        <template #default="{ row }">{{ weatherValue(row.score) }}</template>
      </ElTableColumn>
      <ElTableColumn label="权重" width="80">
        <template #default="{ row }">{{ Math.round(row.weight * 100) }}%</template>
      </ElTableColumn>
      <ElTableColumn label="贡献分" width="90">
        <template #default="{ row }">{{ weatherValue(row.contribution) }}</template>
      </ElTableColumn>
      <ElTableColumn prop="source" label="来源" min-width="180" />
      <ElTableColumn label="来源更新时间" min-width="175">
        <template #default="{ row }">{{ localTime(row.updatedAt) }}</template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { ElTable, ElTableColumn } from "element-plus";
import "element-plus/es/components/table/style/css";
import type { FireRiskFactors } from "../types";
import { rankedFactors, weatherValue, localTime } from "../model";
const props = defineProps<{ factors: FireRiskFactors }>();
const ranking = computed(() => rankedFactors(props.factors));
</script>
