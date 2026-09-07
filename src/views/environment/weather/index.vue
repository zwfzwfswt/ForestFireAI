<template>
  <div class="page-container environment-page weather-page">
    <header>
      <h1>实时气象</h1>
      <p>DEV / MOCK · 最新观测快照，未接入真实气象服务。离线或维护站保留最后观测时间。</p>
    </header>
    <ElCard shadow="never">
      <ElForm inline @submit.prevent>
        <ElFormItem label="状态">
          <ElSelect v-model="status" clearable aria-label="气象状态筛选">
            <ElOption
              v-for="(item, key) in weatherStatuses"
              :key="key"
              :value="key"
              :label="item.label"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="区域">
          <ElSelect v-model="region" clearable aria-label="气象区域筛选">
            <ElOption v-for="item in regions" :key="item.id" :value="item.id" :label="item.name" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <p>共 {{ filtered.length }} 个站点 · 缺失值 -- · 风向为风的来向</p>
      <ElTable :data="filtered" row-key="id" class="weather-table">
        <ElTableColumn prop="name" label="站点" min-width="155" />
        <ElTableColumn prop="code" label="站号" width="90" />
        <ElTableColumn prop="regionName" label="区域" min-width="120" />
        <ElTableColumn
          v-for="column in columns"
          :key="column.key"
          :label="column.label"
          width="120"
        >
          <template #default="{ row }">
            {{ weatherValue(store.latestByStationId[row.id]?.[column.key]) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="风向 / °" min-width="145">
          <template #default="{ row }">
            {{ windText(store.latestByStationId[row.id]?.windDirection) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="更新时间（本地）" min-width="180">
          <template #default="{ row }">{{ localTime(row.lastObservedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="85">
          <template #default="{ row }">
            <span :style="{ color: weatherStatuses[row.status as WeatherStatus].color }">
              {{ weatherStatuses[row.status as WeatherStatus].label }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" fixed="right" width="145">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail(row.id)">详情</ElButton>
            <ElButton link type="primary" @click="locate(row.id)">地图定位</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <p v-if="error" role="alert">{{ error }}</p>
    </ElCard>
    <RemoteDetail v-model="open" title="气象站详情" :rows="details" />
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onDeactivated } from "vue";
import { useRouter } from "vue-router";
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  ElTable,
  ElTableColumn,
  ElButton,
} from "element-plus";
import "../styles";
import { useWeatherStore } from "../../../stores/weather";
import { weatherStatuses, weatherUnits } from "../config";
import { weatherValue, windText, localTime } from "../model";
import type { WeatherStatus } from "../types";
import RemoteDetail from "../../remote-sensing/components/RemoteDetail.vue";
defineOptions({ name: "EnvironmentWeather" });
const store = useWeatherStore(),
  router = useRouter();
const status = ref<WeatherStatus | "">(""),
  region = ref(""),
  error = ref(""),
  open = ref(false);
const regions = computed(() => [
  ...new Map(
    store.stations.map((s) => [s.regionId, { id: s.regionId, name: s.regionName }])
  ).values(),
]);
const filtered = computed(() =>
  store.stations.filter(
    (s) =>
      (!status.value || s.status === status.value) && (!region.value || s.regionId === region.value)
  )
);
const columns = [
  { key: "temperature", label: "温度 °C" },
  { key: "relativeHumidity", label: "湿度 %" },
  { key: "windSpeed", label: "风速 m/s" },
  { key: "precipitation1h", label: "1h 降雨 mm" },
  { key: "precipitation24h", label: "24h 降雨 mm" },
] as const;
const details = computed(() => {
  const s = store.selectedStation,
    o = s && store.latestByStationId[s.id];
  return s
    ? [
        { label: "站点", value: `${s.name} / ${s.code}` },
        { label: "所属单位", value: s.organization },
        { label: "经纬度 WGS84", value: `${s.longitude}, ${s.latitude}` },
        { label: "海拔", value: `${s.altitude} m` },
        ...Object.entries(weatherUnits).map(([key, unit]) => ({
          label: key,
          value:
            key === "windDirection"
              ? windText(o?.windDirection)
              : weatherValue(o?.[key as keyof typeof weatherUnits], ` ${unit}`),
        })),
      ]
    : [];
});
function detail(id: string) {
  store.select(id);
  open.value = true;
}
async function locate(id: string) {
  try {
    store.locate(id);
    if (await router.push("/dashboard")) throw new Error();
  } catch {
    if (store.locateRequest) store.consumeLocate(store.locateRequest.token);
    error.value = "无法打开地图，请重试";
  }
}
watch(
  () => store.sessionVersion,
  () => {
    status.value = "";
    region.value = "";
    open.value = false;
    error.value = "";
  }
);
onDeactivated(() => {
  open.value = false;
});
</script>
