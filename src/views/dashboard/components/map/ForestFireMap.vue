<template>
  <section ref="shell" class="forest-map" aria-label="GIS 综合态势地图">
    <header class="forest-map__header">
      <h2>GIS 综合态势</h2>
      <MapFullscreenControl :target="shell" />
    </header>
    <div class="forest-map__toolbar">
      <MapLayerControl v-model:selected="selected" v-model:visible="visible" />
      <MapToolbar
        :ready="ready"
        :mode="mode"
        :status="status"
        :count="count"
        :visible="drawingVisible"
        :can-finish="canFinish"
        @select="drawing.select"
        @finish="drawing.finish"
        @cancel="drawing.cancel"
        @clear="drawing.clear"
        @toggle="drawingVisible ? drawing.hide() : drawing.show()"
        @reset="resetView"
      />
    </div>
    <div class="forest-map__body">
      <div
        ref="container"
        class="forest-map__canvas"
        aria-label="Leaflet 地图，可使用方向键移动、加减键缩放"
      ></div>
      <p v-if="error" class="forest-map__message" role="status">
        {{ error }}
        <button type="button" @click="retry">重试</button>
      </p>
      <p v-else-if="!ready" class="forest-map__message" role="status">地图加载中…</p>
      <p v-else-if="!visible" class="forest-map__message">底图已隐藏，可在图层控制中重新显示。</p>
    </div>
    <MapCoordinateDisplay :coordinate="coordinate" :zoom="zoom" />
    <small class="forest-map__note">
      在线底图 · 非实时影像；业务统计与告警仍为
      Mock。绘制仅本页临时保存，离开后清空；测量为球面近似。
    </small>
  </section>
</template>
<script setup lang="ts">
import { ref } from "vue";
import "leaflet/dist/leaflet.css";
import MapCoordinateDisplay from "./MapCoordinateDisplay.vue";
import MapFullscreenControl from "./MapFullscreenControl.vue";
import MapLayerControl from "./MapLayerControl.vue";
import MapToolbar from "./MapToolbar.vue";
import { useForestMap } from "./useForestMap";
const shell = ref<HTMLElement | null>(null);
const container = ref<HTMLElement | null>(null);
const { coordinate, zoom, selected, visible, error, ready, retry, drawing, resetView } =
  useForestMap(container);
const { mode, status, count, visible: drawingVisible, canFinish } = drawing;
</script>
<style scoped lang="scss">
.forest-map {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 460px;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  &:fullscreen {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  &__header {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  &__toolbar {
    padding: 0 16px 12px;
  }
  &__body {
    position: relative;
    flex: 1;
    min-height: 340px;
    isolation: isolate;
  }
  &__canvas {
    position: absolute;
    inset: 0;
  }
  :deep(.gis-result) {
    color: var(--el-text-color-primary);
    background: var(--el-bg-color-overlay);
    border-color: var(--el-border-color);
  }
  &__message {
    position: absolute;
    top: 10px;
    right: 10px;
    left: 55px;
    z-index: 1000;
    padding: 10px;
    font-size: 12px;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color-overlay);
    border-radius: 4px;
  }
  &__note {
    padding: 0 16px 10px;
    color: var(--el-text-color-secondary);
  }
}
</style>
