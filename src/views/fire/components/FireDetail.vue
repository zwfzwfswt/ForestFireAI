<template>
  <ElDrawer
    v-if="store.detailOpen"
    v-model="store.detailOpen"
    title="火情详情 · Mock"
    size="min(720px, 96%)"
    append-to-body
    class="fire-detail"
  >
    <template v-if="event">
      <h2>{{ event.title }}</h2>
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem label="编号">{{ event.code }}</ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          <span :style="{ color: fireStatusConfig[event.status].color }">
            {{ fireStatusConfig[event.status].label }}
          </span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="等级">
          {{ fireLevelConfig[event.level].label }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="来源">
          {{ fireSourceConfig[event.source].label }} · {{ event.sourceName || "--" }} /
          {{ event.sourceId || "--" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="位置（WGS84）">
          {{ event.location.longitude.toFixed(6) }}, {{ event.location.latitude.toFixed(6) }} ·
          {{ event.location.address || "--" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="类型 / 描述">
          {{ event.fireType }} · {{ event.description || "--" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="置信度">
          {{ event.confidence === null ? "--" : `${(event.confidence * 100).toFixed(1)}%（Mock）` }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="负责单位 / 人">
          {{ event.assignedOrganization || "--" }} / {{ event.commander || "--" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem v-for="(label, key) in fireTimeLabels" :key="key" :label="label">
          {{ fireTime(event[key]) }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <h3>状态流转</h3>
      <p>仅更新 Mock 事件记录，不下发实际调度指令。</p>
      <template v-if="allowed.length">
        <ElInput
          v-model="remark"
          placeholder="填写状态变更备注"
          maxlength="2000"
          aria-label="状态变更备注"
        />
        <div class="fire-detail__buttons">
          <ElButton v-for="status in allowed" :key="status" @click="transition(status)">
            转为{{ fireStatusConfig[status].label }}
          </ElButton>
        </div>
      </template>
      <p v-else>事件已结束，无后续状态流转。</p>
      <h3>事件时间线</h3>
      <ol class="fire-detail__timeline">
        <li>{{ fireTime(event.createdAt) }} · 创建疑似火情</li>
        <li v-for="record in event.timeline" :key="record.id">
          {{ fireTime(record.timestamp) }} · {{ fireStatusConfig[record.fromStatus].label }} →
          {{ fireStatusConfig[record.toStatus].label }} · {{ record.operator }}
          <p>{{ record.remark || "无备注" }}</p>
        </li>
      </ol>
      <h3>处置记录</h3>
      <p v-if="!event.actions.length">暂无处置记录</p>
      <ol>
        <li v-for="action in event.actions" :key="action.id">
          {{ fireTime(action.time) }} · {{ fireActionConfig[action.type] }} · {{ action.operator }}
          <p>{{ action.content }}</p>
        </li>
      </ol>
      <ElForm @submit.prevent="addAction">
        <ElFormItem label="记录类型">
          <ElSelect v-model="actionType" aria-label="处置记录类型">
            <ElOption
              v-for="(label, key) in fireActionConfig"
              :key="key"
              :value="key"
              :label="label"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="内容">
          <ElInput v-model="content" type="textarea" maxlength="2000" aria-label="处置记录内容" />
        </ElFormItem>
        <ElButton @click="addAction">新增 Mock 处置记录</ElButton>
      </ElForm>
      <p v-if="error" role="alert">{{ error }}</p>
      <h3>关联预留</h3>
      <p>告警 ID：{{ event.alertIds.length ? event.alertIds.join("、") : "暂无关联" }}</p>
      <p>图片、视频、无人机、卫星、人员、消防资源、AI 结果尚未接入。</p>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
import { computed, ref, watch, onDeactivated, onBeforeUnmount } from "vue";
import {
  ElDrawer,
  ElDescriptions,
  ElDescriptionsItem,
  ElButton,
  ElInput,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
} from "element-plus";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/button/style/css";
import { useFireEventStore } from "../../../stores/fireEvent";
import {
  fireStatusConfig,
  fireLevelConfig,
  fireSourceConfig,
  fireActionConfig,
  fireTimeLabels,
  fireTransitions,
  fireTime,
} from "../config";
import type { FireActionType, FireStatus } from "../types";
const store = useFireEventStore();
const event = computed(() => store.selectedEvent);
const allowed = computed(() => (event.value ? fireTransitions[event.value.status] : []));
const remark = ref("");
const content = ref("");
const error = ref("");
const actionType = ref<FireActionType>("note");
watch(
  () => store.selectedId,
  () => {
    remark.value = "";
    content.value = "";
    error.value = "";
  }
);
function transition(status: FireStatus) {
  if (!event.value) return;
  try {
    store.transitionStatus(event.value.id, status, remark.value);
    remark.value = "";
    error.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "状态变更失败";
  }
}
function addAction() {
  if (!event.value) return;
  try {
    store.addAction(event.value.id, actionType.value, content.value);
    content.value = "";
    error.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "记录保存失败";
  }
}
onDeactivated(() => {
  store.detailOpen = false;
});
onBeforeUnmount(() => {
  store.detailOpen = false;
});
</script>
<style scoped>
.fire-detail__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
li {
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
</style>
