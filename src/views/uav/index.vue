<template>
  <div class="page-container uav-page">
    <header>
      <h1>无人机管理</h1>
      <p>
        Mock 资产台账 · {{ store.list.length }} 架 · 全部为静态样例，刷新后恢复。高度相对起飞点。
      </p>
    </header>
    <ElCard shadow="never">
      <ElForm inline :model="query" class="uav-page__search" @submit.prevent="page = 1">
        <ElFormItem label="搜索">
          <ElInput
            v-model="query.keyword"
            placeholder="名称 / SN / 所属单位"
            clearable
            aria-label="搜索无人机"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="query.status" clearable placeholder="全部状态" aria-label="状态筛选">
            <ElOption
              v-for="(item, key) in uavStatuses"
              :key="key"
              :label="item.label"
              :value="key"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="型号">
          <ElSelect v-model="query.model" clearable placeholder="全部型号" aria-label="型号筛选">
            <ElOption v-for="model in models" :key="model" :label="model" :value="model" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem><ElButton @click="resetQuery">重置筛选</ElButton></ElFormItem>
      </ElForm>
    </ElCard>
    <ElCard shadow="never">
      <div class="page-toolbar">
        <ElButton type="primary" @click="edit()">新增无人机</ElButton>
        <span>筛选结果 {{ filtered.length }} 架</span>
      </div>
      <UavTable
        :items="pageItems"
        :selected-id="store.selectedId"
        :deleting="deleting !== null"
        @select="store.select"
        @detail="detail"
        @edit="edit"
        @delete="remove"
        @locate="locate"
      />
      <ElPagination
        v-model:current-page="page"
        :page-size="10"
        :total="filtered.length"
        layout="total, prev, pager, next"
      />
    </ElCard>
    <UavForm v-if="formOpen" v-model="formOpen" :uav="editing" @saved="saved" />
    <UavDetail v-if="detailOpen" v-model="detailOpen" :uav="store.selectedUav" />
    <ElDialog
      v-if="deleting"
      :model-value="deleting !== null"
      title="删除无人机"
      class="uav-delete-dialog"
      width="min(500px, 95%)"
      append-to-body
      :close-on-click-modal="false"
      @update:model-value="deleting = null"
    >
      <p v-if="deleting">
        确认删除 Mock 无人机“{{ deleting.name }}”（SN：{{
          deleting.serialNumber
        }}）？列表与地图标记将同步移除。
      </p>
      <template #footer>
        <ElButton @click="deleting = null">取消</ElButton>
        <ElButton type="danger" @click="confirmRemove">确认删除</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, reactive, watch, onDeactivated, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import "element-plus/es/components/card/style/css";
import "element-plus/es/components/pagination/style/css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/dialog/style/css";
import {
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElButton,
  ElPagination,
  ElMessage,
  ElDialog,
} from "element-plus";
import { useUavStore } from "../../stores/uav";
import UavTable from "./components/UavTable.vue";
import UavForm from "./components/UavForm.vue";
import UavDetail from "./components/UavDetail.vue";
import { uavStatuses } from "./config";
import { filterUavs } from "./model";
import type { Uav, UavQuery } from "./types";
defineOptions({ name: "UavAssets" });
const store = useUavStore();
const router = useRouter();
const query = reactive<UavQuery>({ keyword: "", status: "", model: "" });
const page = ref(1);
const filtered = computed(() => filterUavs(store.list, query));
const pageItems = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
const models = computed(() => [...new Set(store.list.map((uav) => uav.model))].sort());
const editing = ref<Uav | null>(null);
const formOpen = ref(false);
const detailOpen = ref(false);
const deleting = ref<Uav | null>(null);
watch(query, () => {
  page.value = 1;
});
watch(
  () => filtered.value.length,
  (length) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(length / 10)));
  }
);
watch(
  () => store.selectedUav,
  (uav) => {
    if (!uav) detailOpen.value = false;
  }
);
function resetQuery() {
  Object.assign(query, { keyword: "", status: "", model: "" });
}
function edit(uav?: Uav) {
  editing.value = uav ?? null;
  formOpen.value = true;
}
function detail(uav: Uav) {
  store.select(uav.id);
  detailOpen.value = true;
}
function saved(uav: Uav) {
  store.select(uav.id);
  ElMessage.success("Mock 资产已保存");
}
async function locate(uav: Uav) {
  if (store.locate(uav.id)) {
    const request = store.locateRequest;
    try {
      const failure = await router.push("/dashboard");
      if (failure) throw new Error("页面跳转未完成");
    } catch {
      if (request) store.consumeLocate(request.token);
      ElMessage.error("无法打开地图，请重试");
    }
  }
}
function remove(uav: Uav) {
  deleting.value = uav;
}
function confirmRemove() {
  if (!deleting.value) return;
  store.remove(deleting.value.id);
  deleting.value = null;
  ElMessage.success("Mock 无人机已删除");
}
function closeOverlays() {
  formOpen.value = false;
  detailOpen.value = false;
  editing.value = null;
  deleting.value = null;
}
watch(
  () => store.sessionVersion,
  () => {
    closeOverlays();
    resetQuery();
  }
);
onDeactivated(closeOverlays);
onBeforeUnmount(closeOverlays);
</script>
<style scoped lang="scss">
.uav-page {
  height: auto;
  min-height: 100%;
  h1 {
    margin: 0;
    font-size: 22px;
  }
  header p {
    color: var(--el-text-color-secondary);
  }
  &__search {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  :deep(.el-select) {
    width: 180px;
  }
  :deep(.el-pagination) {
    padding-top: 16px;
    overflow: auto;
  }
  .page-toolbar {
    padding-bottom: 14px;
  }
}
</style>
