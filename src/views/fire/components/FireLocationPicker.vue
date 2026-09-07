<template>
  <ElDialog
    v-model="open"
    title="地图选点 · WGS84 / Mock"
    width="min(900px, 95%)"
    append-to-body
    destroy-on-close
  >
    <p>点击“选择位置”，然后点击地图；复用 GIS 点绘制，选择后自动填入表单。</p>
    <ElButton :disabled="!ready" type="primary" @click="drawing.select('point')">选择位置</ElButton>
    <ElButton :disabled="!ready" @click="resetView">默认视角</ElButton>
    <p role="status">{{ error || drawing.status.value }}</p>
    <div ref="container" class="fire-location-map" aria-label="火情位置选择地图"></div>
  </ElDialog>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { ElDialog, ElButton } from "element-plus";
import "leaflet/dist/leaflet.css";
import { useForestMap } from "../../dashboard/components/map/useForestMap";
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ picked: [location: { longitude: number; latitude: number }] }>();
const container = ref<HTMLElement | null>(null);
const { ready, error, drawing, resetView, retry } = useForestMap(container, (point) => {
  emit("picked", { longitude: point.lng, latitude: point.lat });
  open.value = false;
});
// Dialog 的懒加载内容就绪后再初始化；首次 onMounted 可能尚无容器。
watch(container, (value) => {
  if (value) retry();
});
</script>
<style scoped>
.fire-location-map {
  height: 420px;
  margin-top: 12px;
}
</style>
