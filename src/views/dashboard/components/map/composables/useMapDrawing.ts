import { computed, ref } from "vue";
import type * as LeafletModule from "leaflet";
import type { LayerGroup, LeafletMouseEvent, Map, Polyline, Polygon } from "leaflet";
import type { MapLayerRegistry } from "../layers/mapLayerRegistry";
import { distance, polygonError, wrapLongitude } from "../utils/geometry";
import type { GeoPoint } from "../utils/geometry";
import { isAreaMode, measureDrawing } from "./useMapMeasure";
import type { DrawingMode } from "./useMapMeasure";

type Leaflet = typeof LeafletModule;
const prompts: Record<DrawingMode, string> = {
  point: "点击地图绘制点",
  polyline: "点击地图开始绘制折线",
  polygon: "点击地图开始绘制区域",
  distance: "点击地图开始测距",
  area: "点击地图开始测面积",
};

export function useMapDrawing() {
  const mode = ref<DrawingMode | null>(null);
  const status = ref("选择工具开始绘制或测量");
  const count = ref(0);
  const nodeCount = ref(0);
  const visible = ref(true);
  const canFinish = computed(
    () => !!mode.value && nodeCount.value >= (isAreaMode(mode.value) ? 3 : 2)
  );
  let map: Map | undefined;
  let L: Leaflet | undefined;
  let registry: MapLayerRegistry | undefined;
  let draft: LayerGroup | undefined;
  let shape: Polyline | Polygon | undefined;
  let points: GeoPoint[] = [];
  let restoreDoubleClick = false;
  let previousCursor = "";

  function exit() {
    if (map && mode.value) {
      map.off("click", click);
      map.off("mousemove", move);
      map.off("dblclick", doubleClick);
      map.getContainer().removeEventListener("keydown", keydown);
      map.getContainer().style.cursor = previousCursor;
      if (restoreDoubleClick) map.doubleClickZoom.enable();
    }
    mode.value = null;
    points = [];
    shape = undefined;
    nodeCount.value = 0;
  }
  function cancel() {
    if (draft) {
      registry?.get("DrawingLayer")?.removeLayer(draft);
      draft.clearLayers();
      draft = undefined;
    }
    exit();
    status.value = "已退出绘制模式";
  }
  function select(tool: DrawingMode) {
    if (!map || !L || !registry) return;
    const previous = mode.value;
    cancel();
    if (previous === tool) return;
    show();
    mode.value = tool;
    status.value = prompts[tool];
    draft = L.layerGroup().addTo(registry.register("DrawingLayer"));
    restoreDoubleClick = map.doubleClickZoom.enabled();
    map.doubleClickZoom.disable();
    previousCursor = map.getContainer().style.cursor;
    map.getContainer().style.cursor = "crosshair";
    map.on("click", click);
    map.on("mousemove", move);
    map.on("dblclick", doubleClick);
    map.getContainer().addEventListener("keydown", keydown);
    map.getContainer().focus({ preventScroll: true });
  }
  function normalized(event: LeafletMouseEvent): GeoPoint | undefined {
    const { lat, lng } = event.latlng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.05112878) {
      status.value = "请在有效地图范围内绘制（纬度 ±85.051129°）";
      return;
    }
    // 保留当前世界副本，后续节点沿最短经度方向展开，避免跨日期线横穿整张地图。
    const last = points.at(-1);
    return { lat, lng: last ? last.lng + wrapLongitude(lng - last.lng) : lng };
  }
  function render(cursor?: GeoPoint) {
    if (!L || !draft || !mode.value || mode.value === "point") return;
    const vertices = cursor ? [...points, cursor] : points;
    const coordinates = vertices.map((p): [number, number] => [p.lat, p.lng]);
    if (!shape) {
      const options = { color: "#16a085", weight: 3, fillOpacity: 0.18, interactive: false };
      shape = (
        isAreaMode(mode.value) ? L.polygon(coordinates, options) : L.polyline(coordinates, options)
      ).addTo(draft);
    } else shape.setLatLngs(coordinates);
    status.value = `${isAreaMode(mode.value) ? "正在绘制区域；" : ""}继续点击添加节点，双击或点击完成结束；Esc 取消 · ${measureDrawing(mode.value, vertices)}`;
  }
  function click(event: LeafletMouseEvent) {
    if (!L || !draft || !mode.value || (event.originalEvent?.detail ?? 0) > 1) return;
    const point = normalized(event);
    if (!point) return;
    // 去除连续重复点击；折线允许返回旧节点，以正确测量往返距离。
    const last = points.at(-1);
    if (last && distance(last, point) < 0.01) return;
    if (isAreaMode(mode.value) && points.some((existing) => distance(existing, point) < 0.01))
      return;
    points.push(point);
    nodeCount.value = points.length;
    L.circleMarker([point.lat, point.lng], {
      radius: mode.value === "point" ? 6 : 3,
      color: "#16a085",
      fillOpacity: 1,
      interactive: false,
    }).addTo(draft);
    if (mode.value === "point") finish();
    else render();
  }
  function move(event: LeafletMouseEvent) {
    if (!mode.value || !points.length || mode.value === "point") return;
    const point = normalized(event);
    if (point) render(point);
  }
  function doubleClick(event: LeafletMouseEvent) {
    if (event.originalEvent) L?.DomEvent.stop(event.originalEvent);
    finish();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      finish();
    }
  }
  function finish() {
    if (!L || !draft || !mode.value) return;
    const minimum = mode.value === "point" ? 1 : isAreaMode(mode.value) ? 3 : 2;
    const validation =
      points.length < minimum
        ? `至少需要 ${minimum} 个不同节点`
        : isAreaMode(mode.value)
          ? polygonError(points)
          : "";
    if (validation) {
      status.value = validation;
      return;
    }
    render();
    const result = measureDrawing(mode.value, points);
    const anchor = points[points.length - 1];
    // 标签也是 DrawingLayer 的子层，隐藏或清除不会残留在地图根层。
    L.tooltip({ permanent: true, direction: "top", interactive: false, className: "gis-result" })
      .setLatLng([anchor.lat, anchor.lng])
      .setContent(result)
      .addTo(draft);
    draft = undefined;
    count.value++;
    exit();
    status.value = `已完成 · ${result}`;
  }
  function clear() {
    cancel();
    registry?.clear("DrawingLayer");
    count.value = 0;
    status.value = "已清除全部临时绘制和测量结果";
  }
  function show() {
    registry?.show("DrawingLayer");
    visible.value = true;
    status.value = "临时绘制已显示";
  }
  function hide() {
    cancel();
    registry?.hide("DrawingLayer");
    visible.value = false;
    status.value = "临时绘制已隐藏";
  }
  function detach() {
    clear();
    map = undefined;
    L = undefined;
    registry = undefined;
    visible.value = true;
    status.value = "选择工具开始绘制或测量";
  }
  function attach(instance: Map, leaflet: Leaflet, layers: MapLayerRegistry) {
    detach();
    map = instance;
    L = leaflet;
    registry = layers;
    registry.register("DrawingLayer");
  }
  return {
    mode,
    status,
    count,
    visible,
    canFinish,
    select,
    finish,
    cancel,
    clear,
    show,
    hide,
    attach,
    detach,
  };
}
