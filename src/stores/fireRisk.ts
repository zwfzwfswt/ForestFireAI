import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { createMockRiskZones } from "../views/remote-sensing/mock";
import { useWeatherStore } from "./weather";
import { assessRisk, factorsFromObservation } from "../views/environment/model";
export const useFireRiskStore = defineStore("fire-risk", () => {
  const weather = useWeatherStore();
  const riskZones = shallowRef(createMockRiskZones());
  const selectedId = ref<string | null>(null);
  const selectedRiskZone = computed(
    () => riskZones.value.find((z) => z.id === selectedId.value) ?? null
  );
  const highRiskCount = computed(
    () => riskZones.value.filter((z) => ["high", "very_high", "extreme"].includes(z.level)).length
  );
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
  const extremeRiskCount = computed(
    () => riskZones.value.filter((z) => z.level === "extreme").length
  );
  const maximumScore = computed(() =>
    riskZones.value.length ? Math.max(...riskZones.value.map((z) => z.score)) : null
  );
  const averageScore = computed(() =>
    riskZones.value.length
      ? riskZones.value.reduce((sum, z) => sum + z.score, 0) / riskZones.value.length
      : null
  );
  const failedCount = computed(() => riskZones.value.filter((z) => z.assessmentError).length);
  const sessionVersion = ref(0);
  let sequence = 0;
  function select(id: string | null) {
    selectedId.value = riskZones.value.some((z) => z.id === id) ? id : null;
  }
  function locate(id: string) {
    select(id);
    if (!selectedRiskZone.value) throw new Error("火险分区不存在");
    locateRequest.value = { id, token: ++sequence };
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function reset() {
    riskZones.value = createMockRiskZones();
    reassess();
    selectedId.value = null;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  function reassess(id?: string) {
    if (id && !riskZones.value.some((z) => z.id === id)) throw new Error("风险区不存在");
    let updated = 0,
      failed = 0;
    const now = new Date().toISOString();
    riskZones.value = riskZones.value.map((zone) => {
      if (id && zone.id !== id) return zone;
      try {
        const station = weather.stations.find((s) => s.riskZoneId === zone.id);
        const observation = station ? weather.latestByStationId[station.id] : undefined;
        if (!observation) throw new Error("缺少关联站点观测，保留上次评估");
        const factors = factorsFromObservation(zone.factors, observation);
        const result = assessRisk(factors);
        updated++;
        return { ...zone, ...result, factors, generatedAt: now, assessmentError: "" };
      } catch (e) {
        failed++;
        return {
          ...zone,
          assessmentError: e instanceof Error ? e.message : "评估失败，保留上次评估",
        };
      }
    });
    return { updated, failed };
  }
  reassess();
  return {
    riskZones,
    selectedRiskZone,
    selectedId,
    highRiskCount,
    extremeRiskCount,
    maximumScore,
    averageScore,
    failedCount,
    reassess,
    locateRequest,
    sessionVersion,
    select,
    locate,
    consumeLocate,
    reset,
  };
});
