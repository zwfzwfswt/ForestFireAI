import type { LayerGroup, Map as LeafletMap } from "leaflet";

// 只在注册时创建图层，未来业务共享命名约定，不提前实例化业务图层。
export type MapLayerId =
  | "BaseMapLayer"
  | "DrawingLayer"
  | "UAVLayer"
  | "UAVTrackLayer"
  | "MissionLayer"
  | "FireEventLayer"
  | "RemoteSensingLayer"
  | "FireRiskLayer"
  | "ResourceLayer";

export function createMapLayerRegistry(map: LeafletMap, createGroup: () => LayerGroup) {
  const groups = new Map<MapLayerId, LayerGroup>();
  function register(id: MapLayerId) {
    let group = groups.get(id);
    if (!group) {
      group = createGroup();
      groups.set(id, group);
      group.addTo(map);
    }
    return group;
  }
  return {
    register,
    get: (id: MapLayerId) => groups.get(id),
    show(id: MapLayerId) {
      const group = groups.get(id);
      if (group && !map.hasLayer(group)) group.addTo(map);
    },
    hide(id: MapLayerId) {
      const group = groups.get(id);
      if (group) map.removeLayer(group);
    },
    clear(id: MapLayerId) {
      groups.get(id)?.clearLayers();
    },
    dispose() {
      groups.forEach((group) => {
        group.clearLayers();
        map.removeLayer(group);
      });
      groups.clear();
    },
  };
}
export type MapLayerRegistry = ReturnType<typeof createMapLayerRegistry>;
