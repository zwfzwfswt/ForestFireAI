import { computed, ref, shallowRef, watch } from "vue";
import { defineStore } from "pinia";
import { useFireEventStore } from "./fireEvent";
import { createMockAlerts } from "../views/fire/alerts/mock";
import {
  createAlertCodeGenerator,
  normalizedAlert,
  transitionAlert,
} from "../views/fire/alerts/model";
import { dashboardAlertLimit, pendingAlertStatuses } from "../views/fire/alerts/config";
import { fireInput } from "../views/fire/model";
import type { AlertInput, AlertStatus, FireAlert } from "../views/fire/alerts/types";

export const useFireAlertStore = defineStore("fire-alerts", () => {
  const events = useFireEventStore();
  const alerts = shallowRef<FireAlert[]>([]);
  const selectedId = ref<string | null>(null);
  const selectedAlert = computed(
    () => alerts.value.find((alert) => alert.id === selectedId.value) ?? null
  );
  const pendingAlerts = computed(() =>
    alerts.value
      .filter((alert) => pendingAlertStatuses.includes(alert.status))
      .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
  );
  const dashboardAlerts = computed(() => pendingAlerts.value.slice(0, dashboardAlertLimit));
  const detailOpen = ref(false);
  const sessionVersion = ref(0);
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
  let sequence = 0;
  const nextCode = createAlertCodeGenerator();
  function requireAlert(id: string) {
    const alert = alerts.value.find((item) => item.id === id);
    if (!alert) throw new Error("告警不存在");
    return alert;
  }
  function replace(alert: FireAlert) {
    alerts.value = alerts.value.map((item) => (item.id === alert.id ? alert : item));
    return alert;
  }
  function select(id: string | null) {
    selectedId.value = alerts.value.some((alert) => alert.id === id) ? id : null;
    if (!selectedId.value) detailOpen.value = false;
  }
  function showDetail(id: string) {
    select(id);
    detailOpen.value = !!selectedId.value;
  }
  function createAlert(input: AlertInput) {
    const fields = normalizedAlert(input);
    const now = new Date().toISOString();
    const alert: FireAlert = {
      ...fields,
      id: `alert-${Date.now()}-${++sequence}`,
      code: nextCode(alerts.value, now),
      status: "new",
      receivedAt: now,
      reviewer: null,
      reviewedAt: null,
      reviewRemark: "",
      fireEventId: null,
      duplicateOfFireEventId: null,
      createdAt: now,
      updatedAt: now,
    };
    alerts.value = [...alerts.value, alert];
    return alert;
  }
  function updateAlert(id: string, input: AlertInput) {
    const alert = requireAlert(id);
    if (alert.status !== "new") throw new Error("开始研判后不能修改原始告警");
    return replace({ ...alert, ...normalizedAlert(input), updatedAt: new Date().toISOString() });
  }
  function transition(id: string, status: AlertStatus, remark = "") {
    return replace(transitionAlert(requireAlert(id), status, remark, new Date().toISOString()));
  }
  function markDuplicate(id: string, eventId: string, remark: string) {
    if (!events.events.some((event) => event.id === eventId))
      throw new Error("请选择重复信号对应的现有火情");
    const next = transitionAlert(requireAlert(id), "duplicate", remark, new Date().toISOString());
    return replace({ ...next, duplicateOfFireEventId: eventId });
  }
  function linkable(id: string) {
    const alert = requireAlert(id);
    if (alert.status !== "confirmed") throw new Error("只有已确认告警可以创建或关联事件");
    if (alert.fireEventId) throw new Error("告警已经关联，不能重复创建或关联");
    return alert;
  }
  function linkFireEvent(id: string, eventId: string) {
    const alert = linkable(id);
    const event = events.linkAlert(eventId, id);
    replace({ ...alert, fireEventId: event.id, updatedAt: new Date().toISOString() });
    return event;
  }
  function createFireEventFromAlert(id: string) {
    const alert = linkable(id);
    const event = events.createFromAlert(
      {
        ...fireInput(),
        title: alert.title,
        description: alert.description,
        location: { ...alert.location },
        detectedAt: alert.detectedAt,
        source: alert.source,
        sourceId: alert.sourceId,
        sourceName: alert.sourceName,
        confidence: alert.confidence,
        level: alert.level,
      },
      id
    );
    replace({ ...alert, fireEventId: event.id, updatedAt: new Date().toISOString() });
    return event;
  }
  function locateAlert(id: string) {
    requireAlert(id);
    select(id);
    detailOpen.value = false;
    locateRequest.value = { id, token: ++sequence };
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function reset() {
    const initial = createMockAlerts(events.events);
    events.replaceAlertLinks(
      initial.flatMap((alert) =>
        alert.fireEventId ? [{ alertId: alert.id, eventId: alert.fireEventId }] : []
      )
    );
    alerts.value = initial;
    selectedId.value = null;
    detailOpen.value = false;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  reset();
  watch(() => events.sessionVersion, reset, { flush: "sync" });
  return {
    alerts,
    selectedId,
    selectedAlert,
    pendingAlerts,
    dashboardAlerts,
    detailOpen,
    sessionVersion,
    locateRequest,
    select,
    showDetail,
    createAlert,
    updateAlert,
    startReview: (id: string) => transition(id, "reviewing"),
    confirmAlert: (id: string, remark = "") => transition(id, "confirmed", remark),
    rejectAlert: (id: string, remark: string) => transition(id, "rejected", remark),
    markDuplicate,
    linkFireEvent,
    createFireEventFromAlert,
    locateAlert,
    consumeLocate,
    reset,
  };
});
