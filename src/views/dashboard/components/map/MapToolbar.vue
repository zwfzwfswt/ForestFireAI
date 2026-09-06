<template>
  <div class="gis-tools">
    <div class="gis-tools__buttons" role="group" aria-label="GIS 基础工具">
      <button
        v-for="tool in tools"
        :key="tool.mode"
        type="button"
        :disabled="!ready"
        :aria-pressed="mode === tool.mode"
        @click="emit('select', tool.mode)"
      >
        {{ tool.label }}
      </button>
      <button type="button" :disabled="!ready || !canFinish" @click="emit('finish')">完成</button>
      <button type="button" :disabled="!ready || !mode" @click="emit('cancel')">取消</button>
      <button type="button" :disabled="!ready || (!count && !mode)" @click="emit('clear')">
        清除临时绘制
      </button>
      <button type="button" :disabled="!ready" :aria-pressed="visible" @click="emit('toggle')">
        {{ visible ? "隐藏绘制" : "显示绘制" }}（{{ count }}）
      </button>
      <button type="button" :disabled="!ready" @click="emit('reset')">回到默认视角</button>
    </div>
    <p role="status" aria-live="polite">{{ status }}</p>
  </div>
</template>
<script setup lang="ts">
import type { DrawingMode } from "./composables/useMapMeasure";
defineProps<{
  ready: boolean;
  mode: DrawingMode | null;
  status: string;
  count: number;
  visible: boolean;
  canFinish: boolean;
}>();
const emit = defineEmits<{
  select: [mode: DrawingMode];
  finish: [];
  cancel: [];
  clear: [];
  toggle: [];
  reset: [];
}>();
const tools: { mode: DrawingMode; label: string }[] = [
  { mode: "point", label: "绘制点" },
  { mode: "polyline", label: "绘制折线" },
  { mode: "polygon", label: "绘制多边形" },
  { mode: "distance", label: "测距" },
  { mode: "area", label: "测面积" },
];
</script>
<style scoped lang="scss">
.gis-tools {
  margin-top: 10px;
  &__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  button {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--el-text-color-primary);
    cursor: pointer;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    &:hover:not(:disabled),
    &[aria-pressed="true"] {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
      border-color: var(--el-color-success);
    }
    &:focus-visible {
      outline: 2px solid var(--el-color-success);
      outline-offset: 2px;
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }
  p {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
