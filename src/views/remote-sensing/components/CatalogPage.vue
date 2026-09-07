<template>
  <div class="page-container remote-page" :class="isScene ? 'scene-page' : 'product-page'">
    <header>
      <h1>{{ isScene ? "遥感数据" : "遥感产品" }}</h1>
      <p>MOCK / DEMO · 本地示意影像；仅管理已有样例，不执行下载或指数计算。</p>
    </header>
    <ElCard shadow="never">
      <ElForm inline :model="query" @submit.prevent>
        <ElFormItem label="搜索">
          <ElInput v-model="query.keyword" clearable aria-label="遥感搜索" />
        </ElFormItem>
        <template v-if="isScene">
          <ElFormItem label="卫星">
            <ElSelect v-model="query.satellite" clearable aria-label="卫星筛选">
              <ElOption
                v-for="(label, key) in satelliteLabels"
                :key="key"
                :value="key"
                :label="label"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="传感器">
            <ElSelect v-model="query.sensor" clearable aria-label="传感器筛选">
              <ElOption v-for="sensor in sensors" :key="sensor" :value="sensor" :label="sensor" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="最大云量 %">
            <ElInputNumber
              :model-value="query.maxCloud"
              :min="0"
              :max="100"
              :controls="false"
              aria-label="最大云量"
              @update:model-value="query.maxCloud = $event ?? null"
            />
          </ElFormItem>
        </template>
        <ElFormItem v-else label="产品类型">
          <ElSelect v-model="query.type" clearable aria-label="产品类型筛选">
            <ElOption
              v-for="(item, key) in productConfig"
              :key="key"
              :value="key"
              :label="item.label"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="query.status" clearable aria-label="遥感状态筛选">
            <ElOption v-for="(label, key) in statusLabels" :key="key" :value="key" :label="label" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="时间起">
          <ElDatePicker
            v-model="query.from"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="遥感时间起"
          />
        </ElFormItem>
        <ElFormItem label="时间止">
          <ElDatePicker
            v-model="query.to"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="遥感时间止"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton @click="Object.assign(query, emptyCatalogQuery())">重置筛选</ElButton>
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
      <p>筛选结果 {{ filtered.length }} 条</p>
      <ElTable v-if="isScene" :data="scenePage" row-key="id" class="scene-table">
        <ElTableColumn prop="name" label="名称" min-width="185" />
        <ElTableColumn label="卫星" width="120">
          <template #default="{ row }">{{ satelliteLabels[row.satellite as Satellite] }}</template>
        </ElTableColumn>
        <ElTableColumn prop="sensor" label="传感器" width="100" />
        <ElTableColumn label="获取时间" min-width="175">
          <template #default="{ row }">{{ fireTime(row.acquiredAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="分辨率" width="95">
          <template #default="{ row }">{{ row.resolution }} m</template>
        </ElTableColumn>
        <ElTableColumn label="云量" width="80">
          <template #default="{ row }">{{ row.cloudCover }}%</template>
        </ElTableColumn>
        <ElTableColumn label="覆盖区域 WGS84" min-width="260">
          <template #default="{ row }">{{ boundsText(row.bbox) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="90">
          <template #default="{ row }">{{ statusLabels[row.status as ProductStatus] }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail(row.id)">详情</ElButton>
            <ElButton link type="primary" @click="locate(row.id)">地图定位</ElButton>
            <ElButton link type="primary" @click="detail(row.id)">缩略图</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElTable v-else :data="productPage" row-key="id" class="product-table">
        <ElTableColumn prop="name" label="名称" min-width="210" />
        <ElTableColumn label="类型" width="105">
          <template #default="{ row }">{{ productConfig[row.type as ProductType].label }}</template>
        </ElTableColumn>
        <ElTableColumn label="来源影像" min-width="180">
          <template #default="{ row }">{{ sceneName(row.sceneId) }}</template>
        </ElTableColumn>
        <ElTableColumn label="生成时间" min-width="175">
          <template #default="{ row }">{{ fireTime(row.generatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="值域 / 单位" min-width="140">
          <template #default="{ row }">
            {{ row.minValue }} ~ {{ row.maxValue }} {{ row.unit }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="85">
          <template #default="{ row }">{{ statusLabels[row.status as ProductStatus] }}</template>
        </ElTableColumn>
        <ElTableColumn label="显示 / 产品透明度" width="220">
          <template #default="{ row }">
            <input
              type="checkbox"
              :checked="row.visible"
              :disabled="!available(row.status)"
              :aria-label="`${row.name}显示`"
              @change="store.toggle(row.id, ($event.target as HTMLInputElement).checked)"
            />
            <input
              type="range"
              :value="row.opacity"
              min="0"
              max="1"
              step="0.05"
              :disabled="!available(row.status)"
              :aria-label="`${row.name}透明度`"
              @input="store.setOpacity(row.id, Number(($event.target as HTMLInputElement).value))"
            />
            {{ Math.round(row.opacity * 100) }}%
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <ElButton link type="primary" @click="detail(row.id)">查看</ElButton>
            <ElButton
              link
              type="primary"
              :disabled="!available(row.status)"
              @click="locate(row.id)"
            >
              地图显示
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
      <p v-if="!isScene">
        产品开关控制单张影像；地图“业务图层”控制整组。最终透明度为产品与整组透明度的乘积。
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
    </ElCard>
    <RemoteDetail
      v-model="open"
      :title="isScene ? '影像详情' : '产品详情'"
      :rows="rows"
      :thumbnail="isScene ? store.selectedScene?.thumbnailUrl : undefined"
      :legend="isScene ? undefined : store.selectedProduct?.legend"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, onDeactivated } from "vue";
import { useRouter } from "vue-router";
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElDatePicker,
  ElButton,
  ElTable,
  ElTableColumn,
  ElPagination,
} from "element-plus";
import "../styles";
import { useRemoteSensingStore } from "../../../stores/remoteSensing";
import { satelliteLabels, statusLabels, productConfig } from "../config";
import { filterScenes, filterProducts, emptyCatalogQuery, boundsText } from "../model";
import { fireTime } from "../../fire/config";
import type { ProductStatus, ProductType, Satellite } from "../types";
import RemoteDetail from "./RemoteDetail.vue";
const props = defineProps<{ kind: "scene" | "product" }>();
const isScene = computed(() => props.kind === "scene");
const store = useRemoteSensingStore(),
  router = useRouter();
const query = reactive(emptyCatalogQuery()),
  page = ref(1),
  open = ref(false),
  error = ref("");
const sensors = computed(() => [...new Set(store.scenes.map((s) => s.sensor))]);
const filteredScenes = computed(() => filterScenes(store.scenes, query));
const filteredProducts = computed(() => filterProducts(store.products, query));
const filtered = computed(() => (isScene.value ? filteredScenes.value : filteredProducts.value));
const scenePage = computed(() =>
  filteredScenes.value.slice((page.value - 1) * 10, page.value * 10)
);
const productPage = computed(() =>
  filteredProducts.value.slice((page.value - 1) * 10, page.value * 10)
);
const sceneName = (id: string) => store.scenes.find((s) => s.id === id)?.name ?? "--";
const available = (status: ProductStatus) => status === "ready" || status === "available";
const rows = computed(() => {
  const s = store.selectedScene,
    p = store.selectedProduct;
  if (isScene.value && s)
    return Object.entries({
      名称: s.name,
      卫星: satelliteLabels[s.satellite],
      传感器: s.sensor,
      产品级别: s.productLevel,
      获取时间: fireTime(s.acquiredAt),
      分辨率: `${s.resolution} m`,
      云量: `${s.cloudCover}%`,
      范围: boundsText(s.bbox),
      CRS: s.crs,
      状态: statusLabels[s.status],
      说明: s.metadata.description,
    }).map(([label, value]) => ({ label, value }));
  if (!isScene.value && p)
    return Object.entries({
      名称: p.name,
      类型: productConfig[p.type].label,
      来源影像: sceneName(p.sceneId),
      值域: `${p.minValue} ~ ${p.maxValue}`,
      单位: p.unit,
      生成时间: fireTime(p.generatedAt),
      状态: statusLabels[p.status],
    }).map(([label, value]) => ({ label, value }));
  return [];
});
function detail(id: string) {
  if (isScene.value) store.selectScene(id);
  else store.selectProduct(id);
  open.value = true;
}
async function locate(id: string) {
  try {
    store.locate(props.kind, id);
    if (await router.push("/dashboard")) throw new Error("无法打开地图");
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "定位失败";
    if (store.locateRequest) store.consumeLocate(store.locateRequest.token);
  }
}
watch(query, () => {
  page.value = 1;
});
watch(
  () => store.sessionVersion,
  () => {
    open.value = false;
    page.value = 1;
    Object.assign(query, emptyCatalogQuery());
  }
);
onDeactivated(() => {
  open.value = false;
});
</script>
