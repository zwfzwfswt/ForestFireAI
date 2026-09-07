import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { createMockScenes, createMockProducts } from "../views/remote-sensing/mock";
import { validateOpacity } from "../views/remote-sensing/model";
export const useRemoteSensingStore = defineStore("remote-sensing", () => {
  const scenes = shallowRef(createMockScenes());
  const products = shallowRef(createMockProducts());
  const selectedSceneId = ref<string | null>(null),
    selectedProductId = ref<string | null>(null);
  const selectedScene = computed(
    () => scenes.value.find((s) => s.id === selectedSceneId.value) ?? null
  );
  const selectedProduct = computed(
    () => products.value.find((p) => p.id === selectedProductId.value) ?? null
  );
  const locateRequest = shallowRef<{ kind: "scene" | "product"; id: string; token: number } | null>(
    null
  );
  const sessionVersion = ref(0);
  let sequence = 0;
  const selectScene = (id: string | null) => {
    selectedSceneId.value = scenes.value.some((s) => s.id === id) ? id : null;
  };
  const selectProduct = (id: string | null) => {
    selectedProductId.value = products.value.some((p) => p.id === id) ? id : null;
  };
  function requireProduct(id: string) {
    const p = products.value.find((item) => item.id === id);
    if (!p) throw new Error("产品不存在");
    return p;
  }
  function toggle(id: string, visible = !requireProduct(id).visible) {
    const p = requireProduct(id);
    if (visible && p.status !== "ready" && p.status !== "available")
      throw new Error("产品尚不可显示");
    products.value = products.value.map((item) => (item.id === id ? { ...item, visible } : item));
    if (visible) selectProduct(id);
  }
  function setOpacity(id: string, opacity: number) {
    requireProduct(id);
    validateOpacity(opacity);
    products.value = products.value.map((p) => (p.id === id ? { ...p, opacity } : p));
  }
  function locate(kind: "scene" | "product", id: string) {
    if (kind === "product") {
      toggle(id, true);
      if (requireProduct(id).opacity === 0) setOpacity(id, 0.65);
    } else {
      selectScene(id);
      if (!selectedScene.value) throw new Error("影像不存在");
    }
    locateRequest.value = { kind, id, token: ++sequence };
  }
  function consumeLocate(token: number) {
    if (locateRequest.value?.token === token) locateRequest.value = null;
  }
  function reset() {
    scenes.value = createMockScenes();
    products.value = createMockProducts();
    selectedSceneId.value = null;
    selectedProductId.value = null;
    locateRequest.value = null;
    sessionVersion.value++;
  }
  return {
    scenes,
    products,
    selectedScene,
    selectedProduct,
    selectedSceneId,
    selectedProductId,
    locateRequest,
    sessionVersion,
    selectScene,
    selectProduct,
    locate,
    consumeLocate,
    toggle,
    setOpacity,
    reset,
  };
});
