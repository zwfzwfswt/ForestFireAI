import type { Layer, LayerGroup, Map as LeafletMap } from "leaflet";
import { layerCategories } from "./layerDefinitions";
import type { LayerDefinition } from "./layerDefinitions";
import { ensurePane, validZIndex } from "./layerPanes";

// 只在注册时创建图层，未来业务共享命名约定，不提前实例化业务图层。
export type MapLayerId =
  | "BaseMapLayer"
  | "DrawingLayer"
  | "UAVLayer"
  | "UAVTrackLayer"
  | "MissionLayer"
  | "FireEventLayer"
  | "FireAlertLayer"
  | "RemoteSensingLayer"
  | "FireRiskLayer"
  | "ResourceLayer";

export interface BusinessLayerState extends LayerDefinition {
  pane: string;
  status: "unconfigured" | "loading" | "ready" | "empty" | "error";
  featureCount: number;
  error: string;
}
export type LayerFactory = (pane: string) => { layer: Layer; featureCount: number };

export function createMapLayerRegistry(
  map: LeafletMap,
  createGroup: () => LayerGroup,
  onChange: (states: readonly BusinessLayerState[]) => void = () => {}
) {
  // 保留原有组注册 API；业务元数据和所属组仍由这一份 Registry 管理。
  const groups = new Map<string, LayerGroup>();
  const states = new Map<string, BusinessLayerState>();
  const panes = new Map<string, HTMLElement>();
  let disposed = false;
  const list = () => [...states.values()].map((state) => Object.freeze({ ...state }));
  const publish = () => onChange(list());
  function assertActive() {
    if (disposed) throw new Error("图层注册表已销毁");
  }
  function business(id: string) {
    assertActive();
    const state = states.get(id);
    if (!state) throw new Error(`未注册业务图层：${id}`);
    return state;
  }
  function register(id: MapLayerId) {
    assertActive();
    if (states.has(id)) throw new Error("业务图层必须通过 registerBusiness 注册");
    let group = groups.get(id);
    if (!group) {
      group = createGroup();
      groups.set(id, group);
      group.addTo(map);
    }
    return group;
  }
  function sync(state: BusinessLayerState) {
    const pane = panes.get(state.id);
    if (pane) {
      pane.style.opacity = String(state.opacity);
      pane.style.zIndex = String(state.zIndex);
      pane.style.visibility = state.visible && state.opacity > 0 ? "" : "hidden";
    }
    const group = groups.get(state.id);
    if (group) {
      if (state.visible && !map.hasLayer(group)) group.addTo(map);
      else if (!state.visible) map.removeLayer(group);
    }
  }
  function registerBusiness(definition: LayerDefinition, factory?: LayerFactory) {
    assertActive();
    const { id, opacity, zIndex, band } = definition;
    if (!/^[a-z][a-z0-9-]*$/i.test(id) || ["BaseMapLayer", "DrawingLayer"].includes(id))
      throw new Error("业务图层 ID 无效或为保留名称");
    if (states.has(id) || groups.has(id)) throw new Error(`图层重复注册：${id}`);
    if (
      !layerCategories.some((category) => category.id === definition.category) ||
      !["marker", "polyline", "polygon", "geojson", "raster"].includes(definition.type)
    )
      throw new Error("图层分类或类型无效");
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
      throw new Error("透明度必须在 0–1 之间");
    if (!validZIndex(band, zIndex) || [...states.values()].some((state) => state.zIndex === zIndex))
      throw new Error("图层层级越界或已占用");
    const state: BusinessLayerState = {
      ...definition,
      pane: `ff-business-${id}`,
      status: factory ? "loading" : "unconfigured",
      featureCount: 0,
      error: "",
    };
    states.set(id, state);
    if (!factory) state.visible = false;
    else {
      publish();
      let group: LayerGroup | undefined;
      try {
        panes.set(id, ensurePane(map, state.pane, zIndex));
        group = createGroup();
        groups.set(id, group);
        const result = factory(state.pane);
        if (!Number.isInteger(result.featureCount) || result.featureCount < 0)
          throw new Error("要素数量无效");
        group.addLayer(result.layer);
        state.featureCount = result.featureCount;
        state.status = result.featureCount ? "ready" : "empty";
        sync(state);
      } catch (error) {
        group?.clearLayers();
        if (group) map.removeLayer(group);
        groups.delete(id);
        state.status = "error";
        state.featureCount = 0;
        state.visible = false;
        state.error = error instanceof Error ? error.message : "图层加载失败";
        sync(state);
      }
    }
    publish();
    return Object.freeze({ ...state });
  }
  function setVisible(id: string, visible: boolean) {
    const state = business(id);
    if (state.status !== "ready" && state.status !== "empty") return;
    state.visible = visible;
    sync(state);
    publish();
  }
  return {
    register,
    registerBusiness,
    setFeatureCount(id: string, count: number) {
      const state = business(id);
      if (!groups.has(id) || !Number.isInteger(count) || count < 0)
        throw new Error("要素数量无效或图层未加载");
      if (state.featureCount === count) return;
      state.featureCount = count;
      state.status = count ? "ready" : "empty";
      publish();
    },
    replaceBusiness(id: string, factory: LayerFactory) {
      const state = business(id);
      const group = groups.get(id);
      if (!group) throw new Error("业务图层尚未加载");
      // 先构造并验证，再替换；工厂失败不清除当前内容或其他业务组。
      const result = factory(state.pane);
      if (!Number.isInteger(result.featureCount) || result.featureCount < 0)
        throw new Error("要素数量无效");
      group.clearLayers();
      group.addLayer(result.layer);
      state.featureCount = result.featureCount;
      state.status = result.featureCount ? "ready" : "empty";
      state.error = "";
      sync(state);
      publish();
    },
    list,
    getState: (id: string) => (states.has(id) ? Object.freeze({ ...states.get(id)! }) : undefined),
    get: (id: string) => groups.get(id),
    setVisible,
    setOpacity(id: string, opacity: number) {
      const state = business(id);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error("透明度必须在 0–1 之间");
      state.opacity = opacity;
      sync(state);
      publish();
    },
    setZIndex(id: string, zIndex: number) {
      const state = business(id);
      if (
        !validZIndex(state.band, zIndex) ||
        [...states.values()].some((other) => other.id !== id && other.zIndex === zIndex)
      )
        throw new Error("图层层级越界或已占用");
      state.zIndex = zIndex;
      sync(state);
      publish();
    },
    move(id: string, direction: "up" | "down") {
      const state = business(id);
      const siblings = [...states.values()]
        .filter((other) => other.band === state.band && other.status === "ready")
        .sort((a, b) => a.zIndex - b.zIndex);
      const index = siblings.indexOf(state);
      const neighbor = siblings[index + (direction === "up" ? 1 : -1)];
      if (index < 0 || !neighbor) return;
      [state.zIndex, neighbor.zIndex] = [neighbor.zIndex, state.zIndex];
      sync(state);
      sync(neighbor);
      publish();
    },
    show(id: string) {
      if (states.has(id)) return setVisible(id, true);
      const group = groups.get(id);
      if (group && !map.hasLayer(group)) group.addTo(map);
    },
    hide(id: string) {
      if (states.has(id)) return setVisible(id, false);
      const group = groups.get(id);
      if (group) map.removeLayer(group);
    },
    clear(id: string) {
      groups.get(id)?.clearLayers();
      const state = states.get(id);
      if (state && (state.status === "ready" || state.status === "empty")) {
        state.featureCount = 0;
        state.status = "empty";
        publish();
      }
    },
    dispose() {
      groups.forEach((group) => {
        group.clearLayers();
        map.removeLayer(group);
      });
      groups.clear();
      panes.forEach((pane) => pane.remove());
      panes.clear();
      states.clear();
      disposed = true;
      publish();
    },
  };
}
export type MapLayerRegistry = ReturnType<typeof createMapLayerRegistry>;
