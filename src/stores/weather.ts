import { ref, shallowRef, computed } from "vue";
import { defineStore } from "pinia";
import { createMockWeather } from "../views/environment/mock";
import { validateObservation } from "../views/environment/model";
import type { WeatherObservation, WeatherScenario } from "../views/environment/types";
export const useWeatherStore = defineStore("weather", () => {
  const initial = createMockWeather();
  const stations = shallowRef(initial.stations),
    observations = shallowRef(initial.observations);
  const selectedId = ref<string | null>(null),
    sessionVersion = ref(0);
  const selectedStation = computed(
    () => stations.value.find((s) => s.id === selectedId.value) ?? null
  );
  const latestByStationId = computed(() =>
    Object.fromEntries(observations.value.map((o) => [o.stationId, o]))
  );
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
  const scenario = ref<WeatherScenario>("baseline");
  let sequence = 0;
  function select(id: string | null) {
    selectedId.value = stations.value.some((s) => s.id === id) ? id : null;
  }
  function locate(id: string) {
    select(id);
    if (!selectedStation.value) throw new Error("气象站不存在");
    locateRequest.value = { id, token: ++sequence };
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function updateObservation(o: WeatherObservation) {
    validateObservation(o);
    if (!stations.value.some((s) => s.id === o.stationId)) throw new Error("气象站不存在");
    const previous = latestByStationId.value[o.stationId];
    if (previous && Date.parse(o.observedAt) < Date.parse(previous.observedAt))
      throw new Error("拒绝过期观测");
    observations.value = [
      ...observations.value.filter((item) => item.stationId !== o.stationId),
      { ...o },
    ];
    stations.value = stations.value.map((s) =>
      s.id === o.stationId ? { ...s, lastObservedAt: o.observedAt } : s
    );
  }
  function applyScenario(value: WeatherScenario) {
    if (!["baseline", "dry", "wet"].includes(value)) throw new Error("Mock 场景无效");
    const sample = createMockWeather(Date.now(), value);
    stations.value = sample.stations;
    observations.value = sample.observations;
    scenario.value = value;
  }
  function reset() {
    applyScenario("baseline");
    selectedId.value = null;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  return {
    stations,
    observations,
    selectedStation,
    selectedId,
    latestByStationId,
    scenario,
    sessionVersion,
    locateRequest,
    select,
    locate,
    consumeLocate,
    updateObservation,
    applyScenario,
    reset,
  };
});
