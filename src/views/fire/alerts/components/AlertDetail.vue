<template>
  <ElDrawer
    v-if="store.detailOpen"
    v-model="store.detailOpen"
    class="alert-detail"
    title="告警详情与人工研判 · Mock"
    size="min(760px, 96%)"
    append-to-body
  >
    <template v-if="alert">
      <h2>{{ alert.title }}</h2>
      <p>告警是疑似信号。确认有效后，仍需手动创建或关联火情事件。</p>
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem label="编号">{{ alert.code }}</ElDescriptionsItem>
        <ElDescriptionsItem label="类型">
          {{ alertTypeConfig[alert.type].label }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="来源">
          {{ alertSourceConfig[alert.source].label }} · {{ alert.sourceName }} /
          {{ alert.sourceId }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="等级">
          {{ alertLevelConfig[alert.level].label }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          {{ alertStatusConfig[alert.status].label }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="置信度">
          {{ alertConfidence(alert.confidence) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="位置（WGS84）">
          {{ alert.location.longitude.toFixed(6) }}, {{ alert.location.latitude.toFixed(6) }} ·
          {{ alert.location.address || "--" }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="发现 / 接收">
          {{ fireTime(alert.detectedAt) }} / {{ fireTime(alert.receivedAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="描述">{{ alert.description || "--" }}</ElDescriptionsItem>
        <ElDescriptionsItem label="研判人 / 时间">
          {{ alert.reviewer || "--" }} / {{ fireTime(alert.reviewedAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="研判意见">{{ alert.reviewRemark || "--" }}</ElDescriptionsItem>
        <ElDescriptionsItem label="创建 / 更新">
          {{ fireTime(alert.createdAt) }} / {{ fireTime(alert.updatedAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="关联火情">
          <ElButton v-if="linkedEvent" link type="primary" @click="openEvent(linkedEvent.id)">
            {{ linkedEvent.code }} · 查看火情
          </ElButton>
          <span v-else>未关联</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem v-if="duplicateEvent" label="重复信号归属">
          {{ duplicateEvent.code }} · {{ duplicateEvent.title }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <h3>图像证据</h3>
      <ElImage
        v-if="alert.media.imageUrl || alert.media.thumbnailUrl"
        :src="alert.media.thumbnailUrl || alert.media.imageUrl || ''"
        :preview-src-list="alert.media.imageUrl ? [alert.media.imageUrl] : []"
        fit="contain"
        class="alert-detail__image"
        alt="Mock 告警示意图，非真实检测结果"
      >
        <template #error>图片无法加载</template>
      </ElImage>
      <p v-else>暂无图片证据</p>
      <p>DEV / MOCK 示意图 · 视频播放预留，当前未接入视频流。</p>
      <h3>人工研判</h3>
      <ElButton
        v-if="can('reviewing')"
        type="primary"
        @click="run(() => store.startReview(alert!.id))"
      >
        开始研判
      </ElButton>
      <template v-if="can('confirmed')">
        <ElInput
          v-model="remark"
          type="textarea"
          maxlength="2000"
          aria-label="告警研判意见"
          placeholder="填写研判意见；驳回和重复必须说明理由"
        />
        <div class="alert-detail__actions">
          <ElButton type="primary" @click="run(() => store.confirmAlert(alert!.id, remark))">
            确认告警
          </ElButton>
          <ElButton @click="run(() => store.rejectAlert(alert!.id, remark))">驳回告警</ElButton>
        </div>
        <p>如为已有火情的重复来源信号，请选择该事件：</p>
        <ElSelect
          v-model="eventId"
          filterable
          placeholder="选择重复信号对应的火情"
          aria-label="重复火情选择"
        >
          <ElOption
            v-for="event in events.events"
            :key="event.id"
            :value="event.id"
            :label="`${event.code} · ${event.title}`"
          />
        </ElSelect>
        <ElButton
          :disabled="!eventId"
          @click="run(() => store.markDuplicate(alert!.id, eventId, remark))"
        >
          标记重复
        </ElButton>
      </template>
      <template v-if="alert.status === 'confirmed' && !alert.fireEventId">
        <p>
          告警已确认，尚未创建或关联事件。创建时将带入当前告警的位置、时间、来源、置信度和描述。
        </p>
        <ElButton type="primary" @click="run(() => store.createFireEventFromAlert(alert!.id))">
          创建火情事件
        </ElButton>
        <p>也可以关联已有火情：</p>
        <ElSelect v-model="eventId" filterable aria-label="关联火情选择" placeholder="选择现有火情">
          <ElOption
            v-for="event in events.events"
            :key="event.id"
            :value="event.id"
            :label="`${event.code} · ${event.title} · ${fireStatusConfig[event.status].label}`"
          />
        </ElSelect>
        <ElButton :disabled="!eventId" @click="run(() => store.linkFireEvent(alert!.id, eventId))">
          关联已有火情
        </ElButton>
      </template>
      <p v-if="error" role="alert">{{ error }}</p>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
import { computed, ref, watch, onDeactivated, onBeforeUnmount, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
  ElDrawer,
  ElDescriptions,
  ElDescriptionsItem,
  ElButton,
  ElInput,
  ElSelect,
  ElOption,
  ElImage,
} from "element-plus";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/image/style/css";
import { useFireAlertStore } from "../../../../stores/fireAlert";
import { useFireEventStore } from "../../../../stores/fireEvent";
import {
  alertTypeConfig,
  alertSourceConfig,
  alertLevelConfig,
  alertStatusConfig,
  alertConfidence,
  alertTransitions,
} from "../config";
import { fireTime, fireStatusConfig } from "../../config";
import type { AlertStatus } from "../types";
const store = useFireAlertStore();
const events = useFireEventStore();
const router = useRouter();
const alert = computed(() => store.selectedAlert);
const linkedEvent = computed(() =>
  events.events.find((event) => event.id === alert.value?.fireEventId)
);
const duplicateEvent = computed(() =>
  events.events.find((event) => event.id === alert.value?.duplicateOfFireEventId)
);
const remark = ref("");
const error = ref("");
const eventId = ref("");
const can = (status: AlertStatus) =>
  !!alert.value && alertTransitions[alert.value.status].includes(status);
watch(
  () => store.selectedId,
  () => {
    remark.value = "";
    error.value = "";
    eventId.value = "";
  }
);
function run(action: () => unknown) {
  try {
    action();
    error.value = "";
    remark.value = "";
    eventId.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "操作失败";
  }
}
async function openEvent(id: string) {
  try {
    const failure = await router.push("/fire/events");
    if (failure) throw new Error("无法打开火情页面");
    await nextTick();
    events.showDetail(id);
  } catch {
    error.value = "无法打开火情页面，请重试";
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
.alert-detail__image {
  width: 100%;
  max-height: 320px;
}
.alert-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
</style>
