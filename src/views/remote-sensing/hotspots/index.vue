<template>
  <div class="page-container remote-page hotspot-page">
    <header>
      <h1>卫星火点</h1>
      <p>MOCK / DEMO · 热异常线索需要人工核查，生成告警不会创建火情事件。</p>
    </header>
    <ElCard shadow="never">
      <ElForm inline :model="query" @submit.prevent>
        <ElFormItem label="来源">
          <ElSelect v-model="query.source" clearable aria-label="火点来源筛选">
            <ElOption
              v-for="source in ['viirs', 'modis', 'other']"
              :key="source"
              :value="source"
              :label="source.toUpperCase()"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="置信度">
          <ElSelect v-model="query.confidence" clearable aria-label="火点置信度筛选">
            <ElOption value="unknown" label="未提供" />
            <ElOption value="high" label="≥ 80%" />
            <ElOption value="lower" label="< 80%" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem
          v-for="key in ['alert', 'event'] as const"
          :key="key"
          :label="key === 'alert' ? '关联告警' : '关联火情'"
        >
          <ElSelect v-model="query[key]" clearable :aria-label="`火点${key}筛选`">
            <ElOption value="yes" label="已关联" />
            <ElOption value="no" label="未关联" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="发现时间起">
          <ElDatePicker
            v-model="query.from"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="火点时间起"
          />
        </ElFormItem>
        <ElFormItem label="发现时间止">
          <ElDatePicker
            v-model="query.to"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="火点时间止"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton @click="Object.assign(query, emptyHotspotQuery())">重置筛选</ElButton>
        </ElFormItem>
      </ElForm>
      <p
        v-if="query.from && query.to && Date.parse(query.from) > Date.parse(query.to)"
        role="alert"
      >
        开始时间不能晚于结束时间
      </p>
    </ElCard>
    <ElCard shadow="never">
      <p>筛选结果 {{ filtered.length }} 条 · 缺失值显示 --</p>
      <ElTable :data="pageItems" row-key="id" class="hotspot-table">
        <ElTableColumn prop="id" label="ID" width="110" />
        <ElTableColumn label="发现时间" min-width="175">
          <template #default="{ row }">{{ fireTime(row.detectedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="satellite" label="卫星" min-width="170" />
        <ElTableColumn prop="sensor" label="传感器" width="100" />
        <ElTableColumn label="位置 WGS84" min-width="190">
          <template #default="{ row }">
            {{ row.longitude.toFixed(5) }}, {{ row.latitude.toFixed(5) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="置信度" width="90">
          <template #default="{ row }">{{ confidenceText(row.confidence) }}</template>
        </ElTableColumn>
        <ElTableColumn label="FRP (MW)" width="110">
          <template #default="{ row }">{{ optionalValue(row.frp) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="120">
          <template #default="{ row }">
            {{ hotspotStatusLabels[row.status as SatelliteHotspot["status"]] }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="关联告警" min-width="195">
          <template #default="{ row }">
            <ElButton v-if="row.alertId" link type="primary" @click="openAlert(row.alertId)">
              {{ alerts.alerts.find((a) => a.id === row.alertId)?.code }}
            </ElButton>
            <span v-else>--</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="关联火情" min-width="180">
          <template #default="{ row }">
            {{ events.events.find((e) => e.id === row.fireEventId)?.code ?? "--" }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" fixed="right" width="205">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail(row.id)">详情</ElButton>
            <ElButton link type="primary" @click="locate(row.id)">定位</ElButton>
            <ElButton link type="primary" :disabled="!!row.alertId" @click="generate(row.id)">
              生成告警
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="page"
        :total="filtered.length"
        :page-size="10"
        layout="total, prev, pager, next"
      />
      <p v-if="message" role="status">{{ message }}</p>
    </ElCard>
    <RemoteDetail v-model="open" title="卫星火点详情" :rows="rows" />
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, onDeactivated, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  ElDatePicker,
  ElButton,
  ElTable,
  ElTableColumn,
  ElPagination,
} from "element-plus";
import "../styles";
import { useSatelliteHotspotStore } from "../../../stores/satelliteHotspot";
import { useFireAlertStore } from "../../../stores/fireAlert";
import { useFireEventStore } from "../../../stores/fireEvent";
import { confidenceText, optionalValue, hotspotStatusLabels } from "../config";
import { filterHotspots, emptyHotspotQuery } from "../model";
import { fireTime } from "../../fire/config";
import type { SatelliteHotspot } from "../types";
import RemoteDetail from "../components/RemoteDetail.vue";
defineOptions({ name: "SatelliteHotspots" });
const store = useSatelliteHotspotStore(),
  alerts = useFireAlertStore(),
  events = useFireEventStore(),
  router = useRouter();
const query = reactive(emptyHotspotQuery()),
  page = ref(1),
  open = ref(false),
  message = ref("");
const filtered = computed(() => filterHotspots(store.hotspots, query));
const pageItems = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
const rows = computed(() => {
  const h = store.selectedHotspot;
  return h
    ? Object.entries({
        ID: h.id,
        来源: h.source,
        卫星: h.satellite,
        传感器: h.sensor,
        位置: `${h.longitude}, ${h.latitude} (WGS84)`,
        发现时间: fireTime(h.detectedAt),
        置信度: confidenceText(h.confidence),
        FRP: optionalValue(h.frp, " MW"),
        亮温: optionalValue(h.brightness, " K"),
        昼夜: h.dayNight === "day" ? "白天" : "夜间",
        状态: hotspotStatusLabels[h.status],
        关联告警: h.alertId ?? "--",
        关联火情: h.fireEventId ?? "--",
      }).map(([label, value]) => ({ label, value }))
    : [];
});
function detail(id: string) {
  store.select(id);
  open.value = true;
}
function generate(id: string) {
  try {
    const alert = store.generateAlert(id);
    message.value = `已生成 ${alert.code}，请前往告警中心研判；未创建火情事件。`;
  } catch (e) {
    message.value = e instanceof Error ? e.message : "生成失败";
  }
}
async function locate(id: string) {
  try {
    store.locate(id);
    if (await router.push("/dashboard")) throw new Error("无法打开地图");
  } catch {
    if (store.locateRequest) store.consumeLocate(store.locateRequest.token);
    message.value = "无法打开地图，请重试";
  }
}
async function openAlert(id: string) {
  try {
    if (await router.push("/fire/alerts")) throw new Error();
    await nextTick();
    alerts.showDetail(id);
  } catch {
    message.value = "无法打开告警中心";
  }
}
watch(query, () => {
  page.value = 1;
});
watch(
  () => filtered.value.length,
  (n) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(n / 10)));
  }
);
watch(
  () => store.sessionVersion,
  () => {
    open.value = false;
    message.value = "";
    Object.assign(query, emptyHotspotQuery());
  }
);
onDeactivated(() => {
  open.value = false;
});
</script>
