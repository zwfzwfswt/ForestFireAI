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
  function createRecord(input: FireInput) {
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
    return event;
  }
  function createEvent(input: FireInput) {
    const event = createRecord(input);
    events.value = [...events.value, event];
    return event;
  }
  function linkAlert(eventId: string, alertId: string) {
    const event = requireEvent(eventId);
    if (!alertId || events.value.some((item) => item.alertIds.includes(alertId)))
      throw new Error("告警已经关联，不能重复关联");
    return replace({
      ...event,
      alertIds: [...event.alertIds, alertId],
      updatedAt: new Date().toISOString(),
    });
  }
  // 已确认告警由用户明确升级；共用创建和状态机，构造完成后一次写入。
  function createFromAlert(input: FireInput, alertId: string) {
    if (!alertId || events.value.some((item) => item.alertIds.includes(alertId)))
      throw new Error("告警已经关联");
    let event = createRecord(input);
    for (const to of ["verifying", "confirmed"] as const)
      event = transitionFire(event, to, {
        id: id(),
        operator: "Mock 研判员",
        timestamp: event.createdAt,
        remark: "人工从已确认告警创建事件",
      });
    event = { ...event, alertIds: [alertId] };
    events.value = [...events.value, event];
    return event;
  }
  // 仅供 Alert 会话初始化/重置同步关联，事件内容与历史保持不变。
  function replaceAlertLinks(links: readonly { alertId: string; eventId: string }[]) {
    const seen = new Set<string>();
    for (const link of links) {
      requireEvent(link.eventId);
      if (seen.has(link.alertId)) throw new Error("告警关联重复");
      seen.add(link.alertId);
    }
    events.value = events.value.map((event) => ({
      ...event,
      alertIds: links.filter((link) => link.eventId === event.id).map((link) => link.alertId),
    }));
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
    createFromAlert,
    linkAlert,
    replaceAlertLinks,
    updateEvent,
    transitionStatus: addTimeline,
    addTimeline,
    addAction,
    locateEvent,
    consumeLocate,
    reset,
  };
});
