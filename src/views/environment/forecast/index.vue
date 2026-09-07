<template>
  <div class="page-container environment-page forecast-page">
    <header>
      <h1>气象预报</h1>
      <p>DEV / MOCK · 未来 24h，每 3 小时一步。预报与观测分开存储，缺测曲线断开。</p>
    </header>
    <ElCard shadow="never">
      <ElForm inline @submit.prevent>
        <ElFormItem label="预报地点">
          <ElSelect v-model="store.locationId" aria-label="预报地点">
            <ElOption v-for="s in weather.stations" :key="s.id" :value="s.id" :label="s.name" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <p>
        发布时间：{{
          store.selectedForecasts[0] ? localTime(store.selectedForecasts[0].forecastAt) : "--"
        }}
      </p>
      <p v-if="!store.selectedForecasts.length">暂无预报</p>
      <ForecastCharts :items="store.selectedForecasts" />
      <ElTable :data="store.selectedForecasts" row-key="validAt" class="forecast-table">
        <ElTableColumn label="有效时间（本地）" min-width="175">
          <template #default="{ row }">{{ localTime(row.validAt) }}</template>
        </ElTableColumn>
        <ElTableColumn v-for="c in columns" :key="c.key" :label="c.label" width="130">
          <template #default="{ row }">{{ weatherValue(row[c.key]) }}</template>
        </ElTableColumn>
        <ElTableColumn label="风向 / °" min-width="140">
          <template #default="{ row }">{{ windText(row.windDirection) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="fireWeatherHint" label="Mock 提示" min-width="200" />
      </ElTable>
    </ElCard>
  </div>
</template>
<script setup lang="ts">
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  ElTable,
  ElTableColumn,
} from "element-plus";
import "../styles";
import { useForecastStore } from "../../../stores/forecast";
import { useWeatherStore } from "../../../stores/weather";
import { localTime, weatherValue, windText } from "../model";
import ForecastCharts from "../components/ForecastCharts.vue";
defineOptions({ name: "EnvironmentForecast" });
const store = useForecastStore(),
  weather = useWeatherStore();
const columns = [
  { key: "temperature", label: "温度 °C" },
  { key: "relativeHumidity", label: "湿度 %" },
  { key: "windSpeed", label: "风速 m/s" },
  { key: "precipitationProbability", label: "降雨概率 %" },
  { key: "precipitation", label: "降雨 mm" },
] as const;
</script>
