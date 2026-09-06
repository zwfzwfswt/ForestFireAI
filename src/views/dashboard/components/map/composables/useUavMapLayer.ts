import { watch } from "vue";
import type * as Leaflet from "leaflet";
import type { LayerGroup, Map as LeafletMap, Marker, Polyline } from "leaflet";
import { useUavStore } from "../../../../../stores/uav";
import { useTelemetryStore } from "../../../../../stores/telemetry";
import { snapshotValue, uavStatuses } from "../../../../uav/config";
import type { Uav } from "../../../../uav/types";
import type { MapLayerRegistry } from "../layers/mapLayerRegistry";
import { layerStyles } from "../layers/layerStyles";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
export function uavPopup(uav: Uav) {
  return [
    uav.telemetryUpdatedAt ? "DEV / MOCK SIMULATOR" : "无人机 · Mock 静态快照",
    `名称：${uav.name}`,
    `型号：${uav.model}`,
    `状态：${uavStatuses[uav.status].label}`,
    `电量：${snapshotValue(uav.telemetry.battery, "%")}`,
    `高度（相对起飞点）：${snapshotValue(uav.position.altitude, "m")}`,
    `遥测更新时间：${uav.telemetryUpdatedAt ?? "暂无模拟遥测"}`,
    "已同步选中，可在地图下方查看详情",
  ]
    .map(escapeHtml)
    .join("<br>");
}
export function useUavMapLayer(isDrawing: () => boolean) {
  const store = useUavStore();
  const telemetry = useTelemetryStore();
  const markers = new Map<string, Marker>();
  const previous = new Map<string, Uav>();
  const tracks = new Map<string, Polyline>();
  let group: LayerGroup | undefined;
  let trackGroup: LayerGroup | undefined;
  let pane = "";
  let trackPane = "";
  let stop: (() => void) | undefined;
  function icon(L: typeof Leaflet, uav: Uav) {
    const status = uavStatuses[uav.status];
    return L.divIcon({
      className: "ff-uav-symbol",
      html: `<span style="display:grid;place-items:center;width:28px;height:28px;border:2px solid white;border-radius:50%;background:${status.color};color:white;font:bold 16px sans-serif;box-shadow:0 1px 4px #0005">${status.glyph}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
  function syncMarkers(L: typeof Leaflet) {
    if (!group) return;
    const ids = new Set(store.displayList.map((uav) => uav.id));
    markers.forEach((marker, id) => {
      if (!ids.has(id)) {
        marker.closePopup().unbindPopup().off();
        group!.removeLayer(marker);
        markers.delete(id);
        previous.delete(id);
      }
    });
    for (const uav of store.displayList) {
      let marker = markers.get(uav.id);
      const old = previous.get(uav.id);
      if (!marker) {
        marker = L.marker([uav.position.latitude, uav.position.longitude], {
          pane,
          shadowPane: pane,
          title: `${uav.name} · ${uavStatuses[uav.status].label} · Mock`,
          bubblingMouseEvents: true,
          icon: icon(L, uav),
        }).addTo(group);
        marker.on("click", () => {
          if (!isDrawing()) store.select(uav.id);
        });
        if (!isDrawing()) marker.bindPopup(uavPopup(uav), { pane, autoPan: false });
        markers.set(uav.id, marker);
      } else {
        if (
          old?.position.latitude !== uav.position.latitude ||
          old?.position.longitude !== uav.position.longitude
        )
          marker.setLatLng([uav.position.latitude, uav.position.longitude]);
        if (old?.status !== uav.status) marker.setIcon(icon(L, uav));
        if (old?.name !== uav.name || old?.status !== uav.status) {
          marker.options.title = `${uav.name} · ${uavStatuses[uav.status].label} · Mock`;
          const element = marker.getElement();
          if (element) element.title = marker.options.title;
        }
        // Preserve popup instances and listeners, including while open.
        if (!isDrawing()) marker.setPopupContent(uavPopup(uav));
      }
      previous.set(uav.id, uav);
    }
  }
  function syncTracks(L: typeof Leaflet) {
    if (!trackGroup) return;
    const data = telemetry.tracksByUavId;
    tracks.forEach((track, id) => {
      if (!data[id]) {
        trackGroup!.removeLayer(track);
        track.off();
        tracks.delete(id);
      }
    });
    for (const [id, points] of Object.entries(data)) {
      const track = tracks.get(id);
      if (track) track.setLatLngs(points);
      else
        tracks.set(
          id,
          L.polyline(points, {
            pane: trackPane,
            interactive: false,
            color: layerStyles.track.color,
            ...layerStyles.track.path,
          }).addTo(trackGroup)
        );
    }
  }
  function factory(L: typeof Leaflet) {
    return (name: string) => {
      pane = name;
      group = L.layerGroup();
      syncMarkers(L);
      return { layer: group, featureCount: markers.size };
    };
  }
  function trackFactory(L: typeof Leaflet) {
    return (name: string) => {
      trackPane = name;
      trackGroup = L.layerGroup();
      syncTracks(L);
      return { layer: trackGroup, featureCount: tracks.size };
    };
  }
  function attach(map: LeafletMap, L: typeof Leaflet, registry: MapLayerRegistry) {
    stop?.();
    const update = watch(
      () => store.displayList,
      () => {
        syncMarkers(L);
        registry.setFeatureCount("UAVLayer", markers.size);
      },
      { flush: "sync" }
    );
    const trackUpdate = watch(
      () => telemetry.tracksByUavId,
      () => {
        syncTracks(L);
        if (trackGroup) registry.setFeatureCount("UAVTrackLayer", tracks.size);
      },
      { flush: "sync" }
    );
    const locate = watch(
      () => store.locateRequest,
      (request) => {
        if (!request) return;
        const uav = store.displayList.find((item) => item.id === request.id);
        if (uav && markers.has(uav.id)) {
          registry.show("UAVLayer");
          if (registry.getState("UAVLayer")?.opacity === 0) registry.setOpacity("UAVLayer", 1);
          map.flyTo([uav.position.latitude, uav.position.longitude], Math.max(map.getZoom(), 13), {
            animate: false,
          });
          if (!isDrawing()) markers.get(uav.id)!.openPopup();
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
          const uav = store.displayList.find((item) => item.id === id);
          if (!active && uav) marker.bindPopup(uavPopup(uav), { pane, autoPan: false });
        });
      },
      { flush: "sync" }
    );
    stop = () => {
      update();
      trackUpdate();
      locate();
      drawing();
    };
  }
  function detach() {
    stop?.();
    stop = undefined;
    markers.forEach((marker) => marker.closePopup().unbindPopup().off());
    tracks.forEach((track) => track.off());
    markers.clear();
    previous.clear();
    tracks.clear();
    group?.clearLayers();
    trackGroup?.clearLayers();
    group = undefined;
    trackGroup = undefined;
  }
  return { factory, trackFactory, attach, detach };
}
