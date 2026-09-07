import { ref, shallowRef, computed } from "vue";
import { defineStore } from "pinia";
import { createMockForecasts } from "../views/environment/mock";
export const useForecastStore = defineStore("forecast", () => {
  const forecasts = shallowRef(createMockForecasts());
  const locationId = ref("weather-1"),
    sessionVersion = ref(0);
  const selectedForecasts = computed(() =>
    forecasts.value
      .filter((f) => f.locationId === locationId.value)
      .sort((a, b) => Date.parse(a.validAt) - Date.parse(b.validAt))
  );
  function reset() {
    forecasts.value = createMockForecasts();
    locationId.value = "weather-1";
    sessionVersion.value++;
  }
  return { forecasts, locationId, selectedForecasts, sessionVersion, reset };
});
