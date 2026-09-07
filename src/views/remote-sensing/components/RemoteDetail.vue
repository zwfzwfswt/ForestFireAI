<template>
  <ElDrawer
    v-if="open"
    v-model="open"
    :title="`${title} · MOCK / DEMO`"
    size="min(720px, 96%)"
    append-to-body
    class="remote-detail"
  >
    <p>虚构演示数据，仅用于前端业务验证。</p>
    <ElDescriptions :column="1" border>
      <ElDescriptionsItem v-for="row in rows" :key="row.label" :label="row.label">
        {{ row.value }}
      </ElDescriptionsItem>
    </ElDescriptions>
    <ProductLegend v-if="legend" :legend="legend" />
    <ElImage
      v-if="thumbnail"
      :src="thumbnail"
      :preview-src-list="[thumbnail]"
      fit="contain"
      class="remote-detail__image"
      alt="MOCK / DEMO 示意影像，非真实卫星产品"
    >
      <template #error>Mock 图片加载失败</template>
    </ElImage>
    <slot />
  </ElDrawer>
</template>
<script setup lang="ts">
import { onDeactivated, onBeforeUnmount } from "vue";
import { ElDrawer, ElDescriptions, ElDescriptionsItem, ElImage } from "element-plus";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/image/style/css";
import ProductLegend from "./ProductLegend.vue";
import type { Legend } from "../types";
defineProps<{
  title: string;
  rows: { label: string; value: string | number }[];
  thumbnail?: string;
  legend?: Legend;
}>();
const open = defineModel<boolean>({ required: true });
onDeactivated(() => {
  open.value = false;
});
onBeforeUnmount(() => {
  open.value = false;
});
</script>
<style scoped>
.remote-detail__image {
  width: 100%;
  max-height: 360px;
  margin-top: 16px;
}
</style>
