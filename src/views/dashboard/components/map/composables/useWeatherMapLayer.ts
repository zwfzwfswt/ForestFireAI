import { watch } from "vue";
import type * as Leaflet from "leaflet";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { useWeatherStore } from "../../../../../stores/weather";
import { weatherStatuses } from "../../../../environment/config";
import { weatherPopup } from "../../../../environment/mapPopup";
import type { MapLayerRegistry } from "../layers/mapLayerRegistry";
export function useWeatherMapLayer(isDrawing: () => boolean) {
  const store = useWeatherStore(),
    markers = new Map<string, Marker>();
  let group: LayerGroup | undefined,
    pane = "",
    stop: (() => void) | undefined;
  function sync(L: typeof Leaflet) {
    if (!group) return;
    markers.forEach((marker, id) => {
      if (!store.stations.some((s) => s.id === id)) {
        marker.closePopup().unbindPopup().off();
        group!.removeLayer(marker);
        markers.delete(id);
      }
    });
    for (const s of store.stations) {
      const status = weatherStatuses[s.status];
      const icon = L.divIcon({
        className: "ff-weather-symbol",
        html: `<span style="display:grid;place-items:center;width:26px;height:26px;border:2px solid white;border-radius:40% 40% 4px 4px;background:${status.color};color:white;font:bold 13px sans-serif">${status.glyph}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      let marker = markers.get(s.id);
      if (!marker) {
        marker = L.marker([s.latitude, s.longitude], {
          pane,
          shadowPane: pane,
          title: `${s.name} · ${status.label}`,
          bubblingMouseEvents: true,
          icon,
        }).addTo(group);
        marker.on("click", () => {
          if (!isDrawing()) store.select(s.id);
        });
        markers.set(s.id, marker);
      } else {
        marker.setLatLng([s.latitude, s.longitude]);
        marker.setIcon(icon);
      }
      marker.closePopup().unbindPopup();
      if (!isDrawing())
        marker.bindPopup(weatherPopup(s, store.latestByStationId[s.id]), { pane, autoPan: false });
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
      () => [store.stations, store.observations, isDrawing()],
      () => {
        sync(L);
        registry.setFeatureCount("WeatherStationLayer", markers.size);
      },
      { flush: "sync" }
    );
    const locate = watch(
      () => store.locateRequest,
      (request) => {
        if (!request) return;
        const station = store.stations.find((s) => s.id === request.id);
        if (station) {
          registry.show("WeatherStationLayer");
          if (registry.getState("WeatherStationLayer")?.opacity === 0)
            registry.setOpacity("WeatherStationLayer", 1);
          map.flyTo([station.latitude, station.longitude], Math.max(13, map.getZoom()), {
            animate: false,
          });
          if (!isDrawing()) markers.get(station.id)?.openPopup();
        }
        store.consumeLocate(request.token);
      },
      { immediate: true, flush: "sync" }
    );
    stop = () => {
      update();
      locate();
    };
  }
  function detach() {
    stop?.();
    stop = undefined;
    markers.forEach((m) => m.closePopup().unbindPopup().off());
    markers.clear();
    group?.clearLayers();
    group = undefined;
  }
  return { factory, attach, detach };
}
