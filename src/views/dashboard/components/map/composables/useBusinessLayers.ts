import { shallowRef } from "vue";
import type * as Leaflet from "leaflet";
import { layerDefinitions } from "../layers/layerDefinitions";
import { createBusinessGeoJSON } from "../layers/createBusinessLayer";
import type {
  BusinessLayerState,
  MapLayerRegistry,
  LayerFactory,
} from "../layers/mapLayerRegistry";
import { mockMapLayers } from "../mock/mockMapLayers";

export function useBusinessLayers() {
  const states = shallowRef<readonly BusinessLayerState[]>([]);
  let preferences = new Map<string, Pick<BusinessLayerState, "visible" | "opacity" | "zIndex">>();
  let registry: MapLayerRegistry | undefined;
  const publish = (value: readonly BusinessLayerState[]) => {
    states.value = value;
  };
  function attach(
    layers: MapLayerRegistry,
    L: typeof Leaflet,
    factories: Record<string, LayerFactory> = {}
  ) {
    registry = layers;
    for (const definition of layerDefinitions) {
      const data = mockMapLayers[definition.id];
      layers.registerBusiness(
        {
          ...definition,
          ...(factories[definition.id] ? { source: "mock" as const, visible: true } : {}),
          ...preferences.get(definition.id),
        },
        factories[definition.id] ??
          (data
            ? (pane) => ({
                layer: createBusinessGeoJSON(L, definition, data, pane),
                featureCount: data.features.length,
              })
            : undefined)
      );
    }
  }
  function detach() {
    if (registry) {
      preferences = new Map(
        registry
          .list()
          .map(({ id, visible, opacity, zIndex }) => [id, { visible, opacity, zIndex }])
      );
    }
    registry = undefined;
  }
  return {
    states,
    publish,
    attach,
    detach,
    setVisible: (id: string, value: boolean) => registry?.setVisible(id, value),
    setOpacity: (id: string, value: number) => registry?.setOpacity(id, value),
    move: (id: string, direction: "up" | "down") => registry?.move(id, direction),
  };
}
