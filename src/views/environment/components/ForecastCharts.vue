<template>
  <div class="forecast-charts" aria-label="Mock 温度、湿度、风速预报曲线">
    <ECharts v-if="active" :options="options" width="100%" height="600px" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, onActivated, onDeactivated } from "vue";
import ECharts from "../../../components/ECharts/index.vue";
import type { WeatherForecast } from "../types";
import { localTime } from "../model";
const props = defineProps<{ items: WeatherForecast[] }>();
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
const metrics = [
  { key: "temperature", label: "温度 °C", color: "#c2410c" },
  { key: "relativeHumidity", label: "湿度 %", color: "#0284c7" },
  { key: "windSpeed", label: "风速 m/s", color: "#15803d" },
] as const;
const options = computed(() => ({
  animation: false,
  tooltip: { trigger: "axis" },
  legend: { data: metrics.map((m) => m.label) },
  grid: metrics.map((_, i) => ({ top: 55 + i * 185, height: 120, left: 65, right: 30 })),
  xAxis: metrics.map((_, i) => ({
    type: "category",
    gridIndex: i,
    data: props.items.map((f) => localTime(f.validAt)),
    axisLabel: { hideOverlap: true },
  })),
  yAxis: metrics.map((m, i) => ({ type: "value", gridIndex: i, name: m.label })),
  series: metrics.map((m, i) => ({
    name: m.label,
    type: "line",
    xAxisIndex: i,
    yAxisIndex: i,
    data: props.items.map((f) => f[m.key]),
    connectNulls: false,
    itemStyle: { color: m.color },
  })),
}));
</script>
