<template>
  <div class="page-container alerts-page">
    <header>
      <h1>统一告警中心</h1>
      <p>DEV / MOCK · {{ store.alerts.length }} 条疑似信号 · 研判确认不会自动创建火情事件。</p>
    </header>
    <ElCard shadow="never">
      <ElForm inline :model="query" @submit.prevent="page = 1">
        <ElFormItem label="搜索">
          <ElInput
            v-model="query.keyword"
            clearable
            placeholder="编号 / 标题 / 地址 / 来源名称"
            aria-label="搜索告警"
          />
        </ElFormItem>
        <ElFormItem v-for="filter in filters" :key="filter.key" :label="filter.label">
          <ElSelect v-model="query[filter.key]" clearable :aria-label="`告警${filter.label}筛选`">
            <ElOption
              v-for="(item, key) in filter.options"
              :key="key"
              :label="item.label"
              :value="key"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="发现时间起">
          <ElDatePicker
            v-model="query.from"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="告警发现时间起"
          />
        </ElFormItem>
        <ElFormItem label="发现时间止">
          <ElDatePicker
            v-model="query.to"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="告警发现时间止"
          />
        </ElFormItem>
        <ElFormItem><ElButton @click="resetQuery">重置告警筛选</ElButton></ElFormItem>
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
      <AlertTable :items="pageItems" @detail="store.showDetail($event.id)" @locate="locate" />
      <ElPagination
        v-model:current-page="page"
        :page-size="10"
        :total="filtered.length"
        layout="total, prev, pager, next"
      />
    </ElCard>
    <AlertDetail v-if="active" />
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch, onActivated, onDeactivated, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElButton,
  ElDatePicker,
  ElPagination,
  ElMessage,
} from "element-plus";
import "element-plus/es/components/card/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/date-picker/style/css";
import "element-plus/es/components/pagination/style/css";
import "element-plus/es/components/message/style/css";
import { useFireAlertStore } from "../../../stores/fireAlert";
import { alertTypeConfig, alertSourceConfig, alertLevelConfig, alertStatusConfig } from "./config";
import { filterAlerts } from "./model";
import type { AlertQuery, FireAlert } from "./types";
import AlertTable from "./components/AlertTable.vue";
import AlertDetail from "./components/AlertDetail.vue";
defineOptions({ name: "FireAlerts" });
const store = useFireAlertStore();
const router = useRouter();
const filters = [
  { key: "type", label: "类型", options: alertTypeConfig },
  { key: "source", label: "来源", options: alertSourceConfig },
  { key: "status", label: "状态", options: alertStatusConfig },
  { key: "level", label: "等级", options: alertLevelConfig },
] as const;
const emptyQuery = (): AlertQuery => ({
  keyword: "",
  type: "",
  source: "",
  status: "",
  level: "",
  from: "",
  to: "",
});
const query = reactive(emptyQuery());
const page = ref(1);
const active = ref(true);
const filtered = computed(() => filterAlerts(store.alerts, query));
const pageItems = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
watch(query, () => {
  page.value = 1;
});
watch(
  () => filtered.value.length,
  (length) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(length / 10)));
  }
);
function resetQuery() {
  Object.assign(query, emptyQuery());
}
watch(() => store.sessionVersion, resetQuery);
async function locate(alert: FireAlert) {
  store.locateAlert(alert.id);
  const request = store.locateRequest;
  try {
    if (await router.push("/dashboard")) throw new Error("页面跳转失败");
  } catch {
    if (request) store.consumeLocate(request.token);
    ElMessage.error("无法打开地图，请重试");
  }
}
onActivated(() => {
  active.value = true;
});
function close() {
  active.value = false;
  store.detailOpen = false;
}
onDeactivated(close);
onBeforeUnmount(close);
</script>
<style scoped>
.alerts-page {
  height: auto;
  min-height: 100%;
}
h1 {
  margin: 0;
  font-size: 22px;
}
header p {
  color: var(--el-text-color-secondary);
}
.alerts-page :deep(.el-select) {
  width: 160px;
}
.alerts-page :deep(.el-pagination) {
  padding-top: 16px;
  overflow: auto;
}
</style>
