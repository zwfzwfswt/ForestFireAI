import { watch } from "vue";
import type * as Leaflet from "leaflet";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { useFireAlertStore } from "../../../../../stores/fireAlert";
import {
  alertLevelConfig,
  alertSourceConfig,
  alertStatusConfig,
  alertTypeConfig,
  alertSymbolHtml,
  alertConfidence,
} from "../../../../fire/alerts/config";
import { fireTime } from "../../../../fire/config";
import { useFireEventStore } from "../../../../../stores/fireEvent";
import type { FireAlert } from "../../../../fire/alerts/types";
import type { MapLayerRegistry } from "../layers/mapLayerRegistry";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
export function alertPopup(event: FireAlert, eventCode = "") {
  return (
    [
      "疑似信号 · Mock",
      event.code,
      event.title,
      `类型：${alertTypeConfig[event.type].label}`,
      `置信度：${alertConfidence(event.confidence)}`,
      `关联火情：${eventCode || "--"}`,
      `等级：${alertLevelConfig[event.level].label}`,
      `状态：${alertStatusConfig[event.status].label}`,
      `发现：${fireTime(event.detectedAt)}`,
      `来源：${alertSourceConfig[event.source].label}`,
    ]
      .map(escapeHtml)
      .join("<br>") + '<br><button type="button" class="alert-popup-detail">查看告警</button>'
  );
}
export function useAlertMapLayer(isDrawing: () => boolean) {
  const store = useFireAlertStore();
  const events = useFireEventStore();
  const markers = new Map<string, Marker>();
  let group: LayerGroup | undefined;
  let pane = "";
  let stop: (() => void) | undefined;
  function sync(L: typeof Leaflet) {
    if (!group) return;
    const ids = new Set(store.alerts.map((event) => event.id));
    markers.forEach((marker, id) => {
      if (!ids.has(id)) {
        marker.closePopup().unbindPopup().off();
        group!.removeLayer(marker);
        markers.delete(id);
      }
    });
    for (const event of store.alerts) {
      const options = {
        className: "ff-alert-symbol",
        html: alertSymbolHtml(event),
        iconSize: [36, 36] as [number, number],
        iconAnchor: [18, 18] as [number, number],
      };
      let marker = markers.get(event.id);
      if (!marker) {
        marker = L.marker([event.location.latitude, event.location.longitude], {
          pane,
          shadowPane: pane,
          bubblingMouseEvents: true,
          icon: L.divIcon(options),
        }).addTo(group);
        marker.on("click", () => {
          if (!isDrawing()) store.select(event.id);
        });
        marker.on("popupopen", () => {
          const button = marker!
            .getPopup()
            ?.getElement()
            ?.querySelector<HTMLButtonElement>(".alert-popup-detail");
          // 属性赋值替换旧处理器；随 Popup DOM 销毁，无累积订阅。
          if (button)
            button.onclick = () => {
              if (!isDrawing()) store.showDetail(event.id);
            };
        });
        markers.set(event.id, marker);
      } else {
        marker.setLatLng([event.location.latitude, event.location.longitude]);
        marker.setIcon(L.divIcon(options));
      }
      marker.options.title = `${event.code} · ${event.title} · ${alertStatusConfig[event.status].label} · ${alertLevelConfig[event.level].label} · Mock`;
      const element = marker.getElement();
      if (element) element.title = marker.options.title;
      // 更新内容前关闭 Popup，确保详情按钮绑定对应最新 DOM。
      marker.closePopup().unbindPopup();
      if (!isDrawing())
        marker.bindPopup(
          alertPopup(event, events.events.find((item) => item.id === event.fireEventId)?.code),
          { pane, autoPan: false }
        );
    }
  }
  function factory(L: typeof Leaflet) {
    return (name: string) => {
      pane = name;
      group = L.layerGroup();
      sync(L);
      return { layer: group, featureCount: markers.size };
    };
  }
  function attach(map: LeafletMap, L: typeof Leaflet, registry: MapLayerRegistry) {
    stop?.();
    const update = watch(
      () => [store.alerts, events.events],
      () => {
        sync(L);
        registry.setFeatureCount("FireAlertLayer", markers.size);
      },
      { flush: "sync" }
    );
    const drawing = watch(isDrawing, () => sync(L), { flush: "sync" });
    const locate = watch(
      () => store.locateRequest,
      (request) => {
        if (!request) return;
        const event = store.alerts.find((item) => item.id === request.id);
        if (!event) return;
        registry.show("FireAlertLayer");
        if (registry.getState("FireAlertLayer")?.opacity === 0)
          registry.setOpacity("FireAlertLayer", 1);
        map.flyTo(
          [event.location.latitude, event.location.longitude],
          Math.max(13, map.getZoom()),
          { animate: false }
        );
        if (!isDrawing()) markers.get(event.id)?.openPopup();
        store.consumeLocate(request.token);
      },
      { immediate: true, flush: "sync" }
    );
    stop = () => {
      update();
      drawing();
      locate();
    };
  }
  function detach() {
    stop?.();
    stop = undefined;
    markers.forEach((marker) => marker.closePopup().unbindPopup().off());
    markers.clear();
    group?.clearLayers();
    group = undefined;
  }
  return { factory, attach, detach };
}
