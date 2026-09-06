<template>
  <ElDialog
    v-model="open"
    :title="uav ? '编辑无人机 · Mock' : '新增无人机 · Mock'"
    width="min(620px, 95%)"
    append-to-body
    destroy-on-close
  >
    <p>仅修改本次会话的 Mock 资产。坐标为 WGS84；状态修改不控制设备。</p>
    <ElForm :model="draft" label-width="100px" @submit.prevent="submit">
      <ElFormItem label="名称" required :error="errors.name">
        <ElInput v-model="draft.name" maxlength="80" aria-label="无人机名称" />
      </ElFormItem>
      <ElFormItem label="序列号 SN" required :error="errors.serialNumber">
        <ElInput v-model="draft.serialNumber" maxlength="80" aria-label="无人机 SN" />
      </ElFormItem>
      <ElFormItem label="型号" required :error="errors.model">
        <ElInput v-model="draft.model" maxlength="80" aria-label="无人机型号" />
      </ElFormItem>
      <ElFormItem label="所属单位" :error="errors.organization">
        <ElInput v-model="draft.organization" maxlength="120" aria-label="所属单位" />
      </ElFormItem>
      <ElFormItem :label="uav ? 'Mock 状态' : '初始状态'" :error="errors.status">
        <ElSelect v-model="draft.status" aria-label="无人机状态">
          <ElOption
            v-for="(item, key) in uavStatuses"
            :key="key"
            :label="item.label"
            :value="key"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="经度" required :error="errors.longitude">
        <ElInputNumber
          v-model="draft.longitude"
          :controls="false"
          :precision="6"
          aria-label="经度"
        />
      </ElFormItem>
      <ElFormItem label="纬度" required :error="errors.latitude">
        <ElInputNumber
          v-model="draft.latitude"
          :controls="false"
          :precision="6"
          aria-label="纬度"
        />
      </ElFormItem>
      <ElFormItem label="载荷能力" :error="errors.payload">
        <ElCheckbox v-for="(label, key) in payloadLabels" :key="key" v-model="draft.payload[key]">
          {{ label }}
        </ElCheckbox>
      </ElFormItem>
      <p v-if="error" role="alert">{{ error }}</p>
    </ElForm>
    <template #footer>
      <ElButton @click="open = false">取消</ElButton>
      <ElButton type="primary" @click="submit">保存 Mock 资产</ElButton>
    </template>
  </ElDialog>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/input-number/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/checkbox/style/css";
import "element-plus/es/components/button/style/css";
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElCheckbox,
  ElButton,
} from "element-plus";
import { useUavStore } from "../../../stores/uav";
import { uavInput, validateUav } from "../model";
import { payloadLabels, uavStatuses } from "../config";
import type { Uav } from "../types";
const props = defineProps<{ uav: Uav | null }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [uav: Uav] }>();
const store = useUavStore();
const draft = ref(uavInput());
const errors = ref<ReturnType<typeof validateUav>>({});
const error = ref("");
watch(
  open,
  (value) => {
    if (value) {
      draft.value = uavInput(props.uav ?? undefined);
      errors.value = {};
      error.value = "";
    }
  },
  { immediate: true }
);
watch(
  () => store.sessionVersion,
  () => {
    open.value = false;
  }
);
function submit() {
  errors.value = validateUav(draft.value, store.list, props.uav?.id);
  if (Object.keys(errors.value).length) return;
  try {
    const saved = store.save(draft.value, props.uav?.id);
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败";
  }
}
</script>
