<template>
  <div class="page-container fire-page">
    <header>
      <h1>火情事件</h1>
      <p>
        MOCK · {{ store.events.length }} 条事件 · 仅本次会话保存，刷新恢复；所有来源均为虚构样例。
      </p>
    </header>
    <ElCard shadow="never">
      <ElForm inline :model="query" @submit.prevent="page = 1">
        <ElFormItem label="搜索">
          <ElInput
            v-model="query.keyword"
            placeholder="编号 / 标题 / 地址 / 负责人"
            clearable
            aria-label="搜索火情"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="query.status" clearable aria-label="火情状态筛选">
            <ElOption
              v-for="(item, key) in fireStatusConfig"
              :key="key"
              :label="item.label"
              :value="key"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="等级">
          <ElSelect v-model="query.level" clearable aria-label="火情等级筛选">
            <ElOption
              v-for="(item, key) in fireLevelConfig"
              :key="key"
              :label="item.label"
              :value="key"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="来源">
          <ElSelect v-model="query.source" clearable aria-label="火情来源筛选">
            <ElOption
              v-for="(item, key) in fireSourceConfig"
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
            aria-label="发现时间起"
          />
        </ElFormItem>
        <ElFormItem label="发现时间止">
          <ElDatePicker
            v-model="query.to"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            aria-label="发现时间止"
          />
        </ElFormItem>
        <ElFormItem><ElButton @click="resetQuery">重置筛选</ElButton></ElFormItem>
      </ElForm>
      <p
        v-if="query.from && query.to && Date.parse(query.from) > Date.parse(query.to)"
        role="alert"
      >
        开始时间不能晚于结束时间
      </p>
    </ElCard>
    <ElCard shadow="never">
      <div class="fire-page__toolbar">
        <ElButton type="primary" @click="edit()">新建火情</ElButton>
        <span>筛选结果 {{ filtered.length }} 条</span>
      </div>
      <FireTable
        :items="pageItems"
        @detail="store.showDetail($event.id)"
        @edit="edit"
        @locate="locate"
      />
      <ElPagination
        v-model:current-page="page"
        :page-size="10"
        :total="filtered.length"
        layout="total, prev, pager, next"
      />
    </ElCard>
    <FireForm
      v-if="formOpen"
      v-model="formOpen"
      :event="editing"
      @saved="store.select($event.id)"
    />
    <FireDetail v-if="active" />
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
import "element-plus/es/components/pagination/style/css";
import "element-plus/es/components/message/style/css";
import { useFireEventStore } from "../../stores/fireEvent";
import { fireStatusConfig, fireLevelConfig, fireSourceConfig } from "./config";
import { filterFireEvents } from "./model";
import type { FireEvent, FireQuery } from "./types";
import FireTable from "./components/FireTable.vue";
import FireForm from "./components/FireForm.vue";
import FireDetail from "./components/FireDetail.vue";
defineOptions({ name: "FireEvents" });
const store = useFireEventStore();
const router = useRouter();
const emptyQuery = (): FireQuery => ({
  keyword: "",
  status: "",
  level: "",
  source: "",
  from: "",
  to: "",
});
const query = reactive(emptyQuery());
const page = ref(1);
const filtered = computed(() => filterFireEvents(store.events, query));
const pageItems = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
const formOpen = ref(false);
const editing = ref<FireEvent | null>(null);
const active = ref(true);
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
function edit(event?: FireEvent) {
  editing.value = event ?? null;
  formOpen.value = true;
}
async function locate(event: FireEvent) {
  store.locateEvent(event.id);
  const request = store.locateRequest;
  try {
    if (await router.push("/dashboard")) throw new Error("页面跳转未完成");
  } catch {
    if (request) store.consumeLocate(request.token);
    ElMessage.error("无法打开地图，请重试");
  }
}
function close() {
  formOpen.value = false;
  editing.value = null;
  store.detailOpen = false;
  active.value = false;
}
watch(
  () => store.sessionVersion,
  () => {
    formOpen.value = false;
    editing.value = null;
    resetQuery();
  }
);
onActivated(() => {
  active.value = true;
});
onDeactivated(close);
onBeforeUnmount(close);
</script>
<style scoped>
.fire-page {
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
.fire-page__toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}
.fire-page :deep(.el-select) {
  width: 160px;
}
.fire-page :deep(.el-pagination) {
  padding-top: 16px;
  overflow: auto;
}
</style>
