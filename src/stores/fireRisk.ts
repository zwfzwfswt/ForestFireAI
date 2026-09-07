import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { createMockRiskZones } from "../views/remote-sensing/mock";
export const useFireRiskStore = defineStore("fire-risk", () => {
  const riskZones = shallowRef(createMockRiskZones());
  const selectedId = ref<string | null>(null);
  const selectedRiskZone = computed(
    () => riskZones.value.find((z) => z.id === selectedId.value) ?? null
  );
  const highRiskCount = computed(
    () => riskZones.value.filter((z) => ["high", "very_high", "extreme"].includes(z.level)).length
  );
  const locateRequest = shallowRef<{ id: string; token: number } | null>(null);
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
    selectedId.value = null;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  return {
    riskZones,
    selectedRiskZone,
    selectedId,
    highRiskCount,
    locateRequest,
    sessionVersion,
    select,
    locate,
    consumeLocate,
    reset,
  };
});
