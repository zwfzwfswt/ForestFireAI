<template>
  <details class="map-legend" open>
    <summary>遥感与火险图例 · MOCK / DEMO</summary>
    <p v-if="!shown.length && !riskVisible">
      暂无可见遥感产品或风险分区；可从遥感产品页面选择影像。
    </p>
    <div
      v-for="product in shown"
      :key="product.id"
      class="map-legend__product"
      :data-product-id="product.id"
    >
      <span>{{ product.name }} · 产品透明度 {{ Math.round(product.opacity * 100) }}%</span>
      <input
        type="range"
        :value="product.opacity"
        min="0"
        max="1"
        step="0.05"
        :aria-label="`地图${product.name}透明度`"
        @input="store.setOpacity(product.id, Number(($event.target as HTMLInputElement).value))"
      />
      <button type="button" @click="store.toggle(product.id, false)">隐藏产品</button>
      <ProductLegend :legend="product.legend" />
    </div>
    <ProductLegend
      v-if="riskVisible && !shown.some((p) => p.type === 'fire_risk')"
      :legend="productConfig.fire_risk.legend"
    />
    <p v-for="(error, id) in errors" :key="id" role="alert">{{ error }}</p>
  </details>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useRemoteSensingStore } from "../../../../stores/remoteSensing";
import { productLayerId, productConfig } from "../../../remote-sensing/config";
import ProductLegend from "../../../remote-sensing/components/ProductLegend.vue";
import type { BusinessLayerState } from "./layers/mapLayerRegistry";
const props = defineProps<{
  layers: readonly BusinessLayerState[];
  errors: Record<string, string>;
}>();
const store = useRemoteSensingStore();
const visible = (id: string) =>
  props.layers.some((l) => l.id === id && l.visible && l.opacity > 0 && l.status === "ready");
const shown = computed(() =>
  store.products.filter((p) => p.visible && visible(productLayerId(p.type)))
);
const riskVisible = computed(() => visible("FireRiskLayer"));
</script>
<style scoped>
.map-legend {
  padding: 10px 16px;
  font-size: 12px;
  border-top: 1px solid var(--el-border-color);
}
summary {
  margin-bottom: 8px;
  cursor: pointer;
}
.map-legend__product {
  padding: 8px 0;
}
input {
  width: 95px;
  vertical-align: middle;
  accent-color: var(--el-color-success);
}
button {
  padding: 3px 6px;
  margin-left: 8px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
</style>
