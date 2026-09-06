<template>
  <details class="business-panel">
    <summary>
      业务图层 · Mock（{{ layers.filter((layer) => layer.visible).length }} / {{ layers.length }}）
    </summary>
    <p class="business-panel__note">
      虚构演示数据 · 非真实火情或设施。上移/下移调整同一空间层级内的顺序。
    </p>
    <div class="business-panel__categories">
      <details
        v-for="category in layerCategories"
        :key="category.id"
        class="business-panel__category"
      >
        <summary>{{ category.name }}（{{ grouped(category.id).length }}）</summary>
        <div
          v-for="layer in grouped(category.id)"
          :key="layer.id"
          class="business-panel__layer"
          :data-layer-id="layer.id"
        >
          <label class="business-panel__name">
            <input
              type="checkbox"
              :checked="layer.visible"
              :disabled="!ready || !available(layer)"
              @change="emit('visible', layer.id, ($event.target as HTMLInputElement).checked)"
            />
            <span
              class="business-panel__symbol"
              :style="{ color: layerStyles[layer.symbol].color }"
            >
              {{ layerStyles[layer.symbol].glyph }}
            </span>
            {{ layer.name }}
          </label>
          <span class="business-panel__status" :title="layer.error">{{ statusLabel(layer) }}</span>
          <div v-if="available(layer)" class="business-panel__controls">
            <label>
              透明度
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="layer.opacity"
                :disabled="!ready"
                :aria-label="`${layer.name}透明度`"
                @input="
                  emit('opacity', layer.id, Number(($event.target as HTMLInputElement).value))
                "
              />
              <output>{{ Math.round(layer.opacity * 100) }}%</output>
            </label>
            <button
              type="button"
              :aria-label="`${layer.name}上移`"
              :disabled="!ready || !canMove(layer, 'up')"
              @click="emit('move', layer.id, 'up')"
            >
              上移
            </button>
            <button
              type="button"
              :aria-label="`${layer.name}下移`"
              :disabled="!ready || !canMove(layer, 'down')"
              @click="emit('move', layer.id, 'down')"
            >
              下移
            </button>
          </div>
        </div>
      </details>
    </div>
  </details>
</template>
<script setup lang="ts">
import { layerCategories } from "./layers/layerDefinitions";
import type { LayerCategory } from "./layers/layerDefinitions";
import { layerStyles } from "./layers/layerStyles";
import type { BusinessLayerState } from "./layers/mapLayerRegistry";
const props = defineProps<{ layers: readonly BusinessLayerState[]; ready: boolean }>();
const emit = defineEmits<{
  visible: [id: string, value: boolean];
  opacity: [id: string, value: number];
  move: [id: string, direction: "up" | "down"];
}>();
const grouped = (category: LayerCategory) =>
  props.layers.filter((layer) => layer.category === category).sort((a, b) => b.zIndex - a.zIndex);
const available = (layer: BusinessLayerState) =>
  layer.status === "ready" || layer.status === "empty";
const canMove = (layer: BusinessLayerState, direction: "up" | "down") =>
  layer.status === "ready" &&
  props.layers.some(
    (other) =>
      other.band === layer.band &&
      other.status === "ready" &&
      (direction === "up" ? other.zIndex > layer.zIndex : other.zIndex < layer.zIndex)
  );
function statusLabel(layer: BusinessLayerState) {
  if (layer.status === "unconfigured") return "未配置";
  if (layer.status === "error") return "加载失败";
  if (layer.status === "loading") return "加载中";
  if (layer.status === "empty") return "无数据";
  return `${layer.visible ? (layer.opacity === 0 ? "完全透明" : "已显示") : "已隐藏"} · Mock · ${layer.featureCount} 项`;
}
</script>
<style scoped lang="scss">
.business-panel {
  padding: 10px;
  margin-top: 12px;
  font-size: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  summary {
    cursor: pointer;
  }
  &__note {
    color: var(--el-text-color-secondary);
  }
  &__categories {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
    gap: 8px;
    max-height: 290px;
    overflow: auto;
  }
  &__category {
    padding: 8px;
    background: var(--el-fill-color-light);
    border-radius: 4px;
  }
  &__layer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding-top: 10px;
  }
  &__name {
    display: flex;
    gap: 5px;
    align-items: center;
  }
  &__symbol {
    font-weight: bold;
  }
  &__status {
    color: var(--el-text-color-secondary);
  }
  &__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    width: 100%;
    label {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    input {
      width: 75px;
      accent-color: var(--el-color-success);
    }
    output {
      min-width: 32px;
    }
    button {
      padding: 3px 6px;
      color: var(--el-text-color-primary);
      cursor: pointer;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color);
      border-radius: 4px;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }
}
</style>
