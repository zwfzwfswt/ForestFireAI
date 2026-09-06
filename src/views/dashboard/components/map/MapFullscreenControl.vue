<template>
  <button type="button" :disabled="!supported || busy" :aria-pressed="fullscreen" @click="toggle">
    {{ fullscreen ? "退出全屏" : supported ? "地图全屏" : "不支持全屏" }}
  </button>
  <span v-if="error" role="status">{{ error }}</span>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, onDeactivated, onActivated } from "vue";
const props = defineProps<{ target: HTMLElement | null }>();
const fullscreen = ref(false);
const supported = ref(false);
const busy = ref(false);
const error = ref("");
let active = true;
function sync() {
  fullscreen.value = !!props.target && document.fullscreenElement === props.target;
}
function listen() {
  active = true;
  document.addEventListener("fullscreenchange", sync);
  sync();
}
function cleanup() {
  active = false;
  document.removeEventListener("fullscreenchange", sync);
  if (props.target && document.fullscreenElement === props.target)
    void document.exitFullscreen().catch(() => {});
  fullscreen.value = false;
}
async function toggle() {
  if (!props.target || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (document.fullscreenElement === props.target) await document.exitFullscreen();
    else {
      await props.target.requestFullscreen();
      if (!active && document.fullscreenElement === props.target) await document.exitFullscreen();
    }
  } catch {
    error.value = "无法进入全屏，请检查浏览器权限。";
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  supported.value = !!document.fullscreenEnabled;
  listen();
});
onActivated(listen);
onDeactivated(cleanup);
onBeforeUnmount(cleanup);
</script>
<style scoped>
button {
  padding: 6px 10px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
span {
  font-size: 12px;
  color: var(--el-color-warning);
}
</style>
