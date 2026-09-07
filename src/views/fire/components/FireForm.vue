<template>
  <ElDialog
    v-model="open"
    :title="event ? '编辑火情 · Mock' : '新建火情 · Mock'"
    width="min(700px, 95%)"
    append-to-body
    :close-on-click-modal="false"
  >
    <p>仅保存本次会话。新事件为疑似火情；状态流转请在详情中操作。</p>
    <ElForm :model="draft" label-width="110px" @submit.prevent="submit">
      <ElFormItem label="标题" required>
        <ElInput v-model="draft.title" maxlength="120" aria-label="火情标题" />
      </ElFormItem>
      <ElFormItem label="等级">
        <ElSelect v-model="draft.level" aria-label="火情等级">
          <ElOption
            v-for="(item, key) in fireLevelConfig"
            :key="key"
            :label="item.label"
            :value="key"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="发现来源">
        <ElSelect v-model="draft.source" aria-label="火情来源">
          <ElOption
            v-for="(item, key) in fireSourceConfig"
            :key="key"
            :label="item.label"
            :value="key"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="经度" required>
        <ElInputNumber
          v-model="draft.location.longitude"
          :controls="false"
          :precision="6"
          aria-label="火情经度"
        />
      </ElFormItem>
      <ElFormItem label="纬度" required>
        <ElInputNumber
          v-model="draft.location.latitude"
          :controls="false"
          :precision="6"
          aria-label="火情纬度"
        />
        <ElButton @click="picking = true">地图选点</ElButton>
      </ElFormItem>
      <ElFormItem label="地址">
        <ElInput v-model="draft.location.address" maxlength="2000" aria-label="火情地址" />
      </ElFormItem>
      <ElFormItem label="发现时间" required>
        <ElDatePicker
          v-model="draft.detectedAt"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
          aria-label="火情发现时间"
        />
      </ElFormItem>
      <ElFormItem label="火灾类型">
        <ElInput v-model="draft.fireType" maxlength="2000" aria-label="火灾类型" />
      </ElFormItem>
      <ElFormItem label="描述">
        <ElInput
          v-model="draft.description"
          type="textarea"
          maxlength="2000"
          aria-label="火情描述"
        />
      </ElFormItem>
      <ElFormItem label="置信度（0–1）">
        <ElInputNumber
          :model-value="draft.confidence"
          :controls="false"
          :min="0"
          :max="1"
          :step="0.01"
          aria-label="火情置信度"
          @update:model-value="draft.confidence = $event ?? null"
        />
        <span>空值表示未提供</span>
      </ElFormItem>
      <ElFormItem label="来源标识">
        <ElInput v-model="draft.sourceId" maxlength="2000" aria-label="来源标识" />
      </ElFormItem>
      <ElFormItem label="来源名称">
        <ElInput v-model="draft.sourceName" maxlength="2000" aria-label="来源名称" />
      </ElFormItem>
      <ElFormItem label="负责单位">
        <ElInput v-model="draft.assignedOrganization" maxlength="2000" aria-label="火情负责单位" />
      </ElFormItem>
      <ElFormItem label="负责人">
        <ElInput v-model="draft.commander" maxlength="2000" aria-label="火情负责人" />
      </ElFormItem>
      <p v-if="error" role="alert">{{ error }}</p>
    </ElForm>
    <template #footer>
      <ElButton @click="open = false">取消</ElButton>
      <ElButton type="primary" @click="submit">保存 Mock 火情</ElButton>
    </template>
    <FireLocationPicker
      v-if="picking"
      v-model="picking"
      @picked="Object.assign(draft.location, $event)"
    />
  </ElDialog>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElButton,
  ElDatePicker,
} from "element-plus";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/input-number/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/date-picker/style/css";
import { useFireEventStore } from "../../../stores/fireEvent";
import { fireInput } from "../model";
import { fireLevelConfig, fireSourceConfig } from "../config";
import type { FireEvent } from "../types";
import FireLocationPicker from "./FireLocationPicker.vue";
const props = defineProps<{ event: FireEvent | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [event: FireEvent] }>();
const store = useFireEventStore();
const draft = ref(fireInput(props.event ?? undefined));
const error = ref("");
const picking = ref(false);
watch(
  () => store.sessionVersion,
  () => {
    open.value = false;
    picking.value = false;
  }
);
function submit() {
  try {
    const event = props.event
      ? store.updateEvent(props.event.id, draft.value)
      : store.createEvent(draft.value);
    emit("saved", event);
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败";
  }
}
</script>
