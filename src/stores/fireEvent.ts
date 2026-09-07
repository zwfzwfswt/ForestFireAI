import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { createMockFireEvents } from "../views/fire/mock";
import { createFireCodeGenerator, normalizedInput, transitionFire } from "../views/fire/model";
import { fireActionConfig } from "../views/fire/config";
import type { FireActionType, FireEvent, FireInput, FireStatus } from "../views/fire/types";

// 会话级 Mock 唯一数据来源；不持久化、不发请求，不保存 Leaflet 对象。
export const useFireEventStore = defineStore("fire-events", () => {
  const events = shallowRef<FireEvent[]>(createMockFireEvents());
  const selectedId = ref<string | null>(null);
  const selectedEvent = computed(
    () => events.value.find((event) => event.id === selectedId.value) ?? null
  );
  const detailOpen = ref(false);
  const sessionVersion = ref(0);
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
  const nextCode = createFireCodeGenerator();
  let sequence = 0;
  const id = () => `fire-${Date.now()}-${++sequence}`;
  function requireEvent(eventId: string) {
    const event = events.value.find((item) => item.id === eventId);
    if (!event) throw new Error("火情事件不存在，请重新打开");
    return event;
  }
  function replace(event: FireEvent) {
    events.value = events.value.map((item) => (item.id === event.id ? event : item));
    return event;
  }
  function select(eventId: string | null) {
    selectedId.value = events.value.some((item) => item.id === eventId) ? eventId : null;
    if (!selectedId.value) detailOpen.value = false;
  }
  function showDetail(eventId: string) {
    select(eventId);
    detailOpen.value = !!selectedId.value;
  }
  function createEvent(input: FireInput) {
    const fields = normalizedInput(input);
    const now = new Date().toISOString();
    const event: FireEvent = {
      ...fields,
      id: id(),
      code: nextCode(events.value, now),
      status: "suspected",
      confirmedAt: null,
      controlledAt: null,
      extinguishedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      alertIds: [],
      timeline: [],
      actions: [],
    };
    events.value = [...events.value, event];
    return event;
  }
  function updateEvent(eventId: string, input: FireInput) {
    const event = requireEvent(eventId);
    const fields = normalizedInput(input);
    if (
      event.timeline[0] &&
      Date.parse(fields.detectedAt) > Date.parse(event.timeline[0].timestamp)
    )
      throw new Error("发现时间不能晚于首次状态变更");
    return replace({ ...event, ...fields, updatedAt: new Date().toISOString() });
  }
  // Timeline 只能与合法状态变更原子写入，不能单独伪造历史状态。
  function addTimeline(eventId: string, to: FireStatus, remark = "") {
    if (remark.length > 2000) throw new Error("备注最多 2000 字");
    return replace(
      transitionFire(requireEvent(eventId), to, {
        id: id(),
        operator: "Mock 值班员",
        timestamp: new Date().toISOString(),
        remark: remark.trim(),
      })
    );
  }
  function addAction(eventId: string, type: FireActionType, content: string) {
    const event = requireEvent(eventId);
    if (!Object.hasOwn(fireActionConfig, type)) throw new Error("处置记录类型无效");
    if (!content.trim() || content.length > 2000) throw new Error("处置内容必填，最多 2000 字");
    const now = new Date().toISOString();
    return replace({
      ...event,
      updatedAt: now,
      actions: [
        ...event.actions,
        {
          id: id(),
          fireEventId: event.id,
          type,
          content: content.trim(),
          time: now,
          operator: "Mock 值班员",
        },
      ],
    });
  }
  function locateEvent(eventId: string) {
    requireEvent(eventId);
    select(eventId);
    detailOpen.value = false;
    locateRequest.value = { id: eventId, token: ++sequence };
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function reset() {
    events.value = createMockFireEvents();
    selectedId.value = null;
    detailOpen.value = false;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  return {
    events,
    selectedId,
    selectedEvent,
    detailOpen,
    sessionVersion,
    locateRequest,
    select,
    showDetail,
    createEvent,
    updateEvent,
    transitionStatus: addTimeline,
    addTimeline,
    addAction,
    locateEvent,
    consumeLocate,
    reset,
  };
});
