import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { useFireAlertStore } from "./fireAlert";
import { createMockHotspots } from "../views/remote-sensing/mock";
export const useSatelliteHotspotStore = defineStore("satellite-hotspots", () => {
  const alerts = useFireAlertStore();
  const records = shallowRef(createMockHotspots());
  // 关联状态从 Alert 唯一来源派生；Alert 重置后无悬空 ID，人工研判后自动反映事件关联。
  const hotspots = computed(() =>
    records.value.map((h) => {
      const alert = alerts.alerts.find(
        (a) => a.source === "satellite" && a.type === "satellite_hotspot" && a.sourceId === h.id
      );
      return {
        ...h,
        alertId: alert?.id ?? null,
        fireEventId: alert?.fireEventId ?? alert?.duplicateOfFireEventId ?? null,
        status: alert ? ("alert_created" as const) : ("unreviewed" as const),
      };
    })
  );
  const selectedId = ref<string | null>(null);
  const selectedHotspot = computed(
    () => hotspots.value.find((h) => h.id === selectedId.value) ?? null
  );
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
  const sessionVersion = ref(0);
  let sequence = 0;
  function select(id: string | null) {
    selectedId.value = hotspots.value.some((h) => h.id === id) ? id : null;
  }
  function generateAlert(id: string) {
    const h = hotspots.value.find((item) => item.id === id);
    if (!h) throw new Error("卫星火点不存在");
    if (h.alertId) return alerts.alerts.find((a) => a.id === h.alertId)!;
    return alerts.createAlert({
      title: `MOCK 卫星热异常 ${h.id}`,
      type: "satellite_hotspot",
      source: "satellite",
      level: "low",
      location: {
        longitude: h.longitude,
        latitude: h.latitude,
        address: "MOCK 卫星热点（待人工核查）",
      },
      detectedAt: h.detectedAt,
      confidence: h.confidence,
      sourceId: h.id,
      sourceName: `${h.satellite} / ${h.sensor}`,
      media: { imageUrl: null, thumbnailUrl: null, videoUrl: null },
      description:
        "用户手动从 Mock 卫星火点生成的疑似信号；未经火灾核实。等级为初始待研判值，不由置信度推断。",
    });
  }
  function locate(id: string) {
    select(id);
    if (!selectedHotspot.value) throw new Error("卫星火点不存在");
    locateRequest.value = { id, token: ++sequence };
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function reset() {
    records.value = createMockHotspots();
    selectedId.value = null;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  return {
    hotspots,
    selectedId,
    selectedHotspot,
    locateRequest,
    sessionVersion,
    select,
    generateAlert,
    locate,
    consumeLocate,
    reset,
  };
});
