import { watch } from "vue";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useUavStore } from "../../../../../stores/uav";
import { snapshotValue, uavStatuses } from "../../../../uav/config";
import type { Uav } from "../../../../uav/types";
import type { MapLayerRegistry } from "../layers/mapLayerRegistry";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
export function uavPopup(uav: Uav) {
  return [
    "无人机 · Mock 静态快照",
    `名称：${uav.name}`,
    `型号：${uav.model}`,
    `状态：${uavStatuses[uav.status].label}`,
    `电量：${snapshotValue(uav.telemetry.battery, "%")}`,
    `高度（相对起飞点）：${snapshotValue(uav.position.altitude, "m")}`,
    "已同步选中，可在地图下方查看详情",
  ]
    .map(escapeHtml)
    .join("<br>");
}

export function useUavMapLayer(isDrawing: () => boolean) {
  const store = useUavStore();
  let markers = new Map<string, Marker>();
  let stop: (() => void) | undefined;
  function releaseMarkers() {
    markers.forEach((marker) => marker.closePopup().unbindPopup().off());
    markers.clear();
  }
  function factory(L: typeof Leaflet) {
    return (pane: string) => {
      const group = L.layerGroup();
      releaseMarkers();
      markers = new Map();
      for (const uav of store.list) {
        const status = uavStatuses[uav.status];
        const marker = L.marker([uav.position.latitude, uav.position.longitude], {
          pane,
          shadowPane: pane,
          title: `${uav.name} · ${status.label} · Mock`,
          bubblingMouseEvents: true,
          icon: L.divIcon({
            className: "ff-uav-symbol",
            html: `<span style="display:grid;place-items:center;width:28px;height:28px;border:2px solid white;border-radius:50%;background:${status.color};color:white;font:bold 16px sans-serif;box-shadow:0 1px 4px #0005">${status.glyph}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        }).addTo(group);
        if (!isDrawing()) marker.bindPopup(uavPopup(uav), { pane, autoPan: false });
        // 绘制模式中点击 Marker 继续传递给地图，不能抢占绘制工具。
        marker.on("click", () => {
          if (isDrawing()) return;
          store.select(uav.id);
        });
        markers.set(uav.id, marker);
      }
      return { layer: group, featureCount: store.list.length };
    };
  }
  function attach(map: LeafletMap, L: typeof Leaflet, registry: MapLayerRegistry) {
    stop?.();
    const update = watch(
      () => store.list,
      () => registry.replaceBusiness("UAVLayer", factory(L)),
      { flush: "sync" }
    );
    const locate = watch(
      () => store.locateRequest,
      (request) => {
        if (!request) return;
        const uav = store.list.find((item) => item.id === request.id);
        if (uav && markers.has(uav.id)) {
          registry.show("UAVLayer");
          if (registry.getState("UAVLayer")?.opacity === 0) registry.setOpacity("UAVLayer", 1);
          map.flyTo([uav.position.latitude, uav.position.longitude], Math.max(map.getZoom(), 13), {
            animate: false,
          });
          markers
            .get(uav.id)!
            .bindPopup(uavPopup(uav), { pane: registry.getState("UAVLayer")!.pane, autoPan: false })
            .openPopup();
          store.consumeLocate(request.token);
        }
      },
      { immediate: true, flush: "sync" }
    );
    const drawing = watch(
      isDrawing,
      (active) => {
        markers.forEach((marker, id) => {
          marker.closePopup().unbindPopup();
          const uav = store.list.find((item) => item.id === id);
          if (!active && uav)
            marker.bindPopup(uavPopup(uav), {
              pane: registry.getState("UAVLayer")!.pane,
              autoPan: false,
            });
        });
      },
      { flush: "sync" }
    );
    stop = () => {
      update();
      locate();
      drawing();
    };
  }
  function detach() {
    stop?.();
    stop = undefined;
    releaseMarkers();
  }
  return { factory, attach, detach };
}
