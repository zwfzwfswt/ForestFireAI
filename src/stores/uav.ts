import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { createMockUavs } from "../views/uav/mock";
import { validateUav } from "../views/uav/model";
import type { Uav, UavInput } from "../views/uav/types";
import { useTelemetryStore } from "./telemetry";

// 唯一资产来源；只保存可序列化数据，不保存地图实例，不做持久化或网络请求。
export const useUavStore = defineStore("uav-assets", () => {
  const list = shallowRef<Uav[]>(createMockUavs());
  const telemetry = useTelemetryStore();
  telemetry.setAssetIds(list.value.map((uav) => uav.id));
  const displayList = computed(() =>
    list.value.map((uav) => {
      const packet = telemetry.getLatestTelemetry(uav.id);
      if (!packet) return uav;
      return {
        ...uav,
        status: telemetry.isOffline(uav.id) ? ("offline" as const) : packet.status,
        position: {
          longitude: packet.longitude,
          latitude: packet.latitude,
          altitude: packet.altitude,
        },
        telemetry: {
          speed: packet.speed,
          heading: packet.heading,
          battery: packet.battery,
          signal: packet.signal,
        },
        lastOnlineAt: new Date(packet.timestamp).toISOString(),
        telemetryUpdatedAt: new Date(packet.timestamp).toISOString(),
      };
    })
  );
  const selectedId = ref<string | null>(null);
  const selectedUav = computed(
    () => displayList.value.find((uav) => uav.id === selectedId.value) ?? null
  );
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
  const sessionVersion = ref(0);
  let sequence = 0;
  function select(id: string | null) {
    selectedId.value = list.value.some((uav) => uav.id === id) ? id : null;
  }
  function save(input: UavInput, id?: string) {
    const previous = id ? list.value.find((uav) => uav.id === id) : undefined;
    if (id && !previous) throw new Error("无人机已不存在，请重新打开表单");
    const errors = validateUav(input, list.value, id);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const now = new Date().toISOString();
    const uav: Uav = {
      id:
        previous?.id ?? globalThis.crypto?.randomUUID?.() ?? `mock-uav-${Date.now()}-${++sequence}`,
      name: input.name.trim(),
      serialNumber: input.serialNumber.trim(),
      model: input.model.trim(),
      organization: input.organization.trim(),
      status: input.status,
      position: {
        longitude: input.longitude!,
        latitude: input.latitude!,
        altitude: previous?.position.altitude ?? null,
      },
      telemetry: previous
        ? { ...previous.telemetry }
        : { speed: null, heading: null, battery: null, signal: null },
      payload: { ...input.payload },
      lastOnlineAt: previous?.lastOnlineAt ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    list.value = previous
      ? list.value.map((item) => (item.id === id ? uav : item))
      : [...list.value, uav];
    telemetry.setAssetIds(list.value.map((item) => item.id));
    if (
      previous &&
      (previous.status !== uav.status ||
        previous.position.longitude !== uav.position.longitude ||
        previous.position.latitude !== uav.position.latitude)
    )
      telemetry.remove(uav.id);
    return uav;
  }
  function remove(id: string) {
    telemetry.remove(id);
    list.value = list.value.filter((uav) => uav.id !== id);
    telemetry.setAssetIds(list.value.map((item) => item.id));
    if (selectedId.value === id) selectedId.value = null;
    if (locateRequest.value?.id === id) locateRequest.value = null;
  }
  function locate(id: string) {
    if (!list.value.some((uav) => uav.id === id)) return false;
    select(id);
    locateRequest.value = { id, token: ++sequence };
    return true;
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function reset() {
    telemetry.reset();
    selectedId.value = null;
    locateRequest.value = null;
    list.value = createMockUavs();
    telemetry.setAssetIds(list.value.map((item) => item.id));
    sessionVersion.value++;
  }
  return {
    list,
    displayList,
    selectedId,
    selectedUav,
    locateRequest,
    sessionVersion,
    select,
    save,
    remove,
    locate,
    consumeLocate,
    reset,
  };
});
