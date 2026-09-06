import { ref, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount } from "vue";
import type { Ref } from "vue";
import type { Map, LeafletMouseEvent, TileLayer } from "leaflet";
import { mapConfig, baseLayers } from "./mapConfig";
import { createMapSession } from "./mapSession";
import { createMapLayerRegistry } from "./layers/mapLayerRegistry";
import type { MapLayerRegistry } from "./layers/mapLayerRegistry";
import { useMapDrawing } from "./composables/useMapDrawing";

export function useForestMap(container: Ref<HTMLElement | null>) {
  const coordinate = ref<{ lat: number; lng: number } | null>(null);
  const zoom = ref(mapConfig.zoom);
  const selected = ref(mapConfig.defaultBaseLayer);
  const visible = ref(true);
  const error = ref("");
  const ready = ref(false);
  const drawing = useMapDrawing();
  let layers: MapLayerRegistry | undefined;
  let center = mapConfig.center;
  let map: Map | undefined;
  let layer: TileLayer | undefined;
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let updateLayer = () => {};

  function resize() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
  }
  function dispose() {
    drawing.detach();
    observer?.disconnect();
    observer = undefined;
    cancelAnimationFrame(frame);
    if (map) {
      const position = map.getCenter();
      center = [position.lat, position.lng];
      zoom.value = map.getZoom();
      layer?.off();
      layers?.dispose();
      map.remove();
      map.off();
    }
    map = undefined;
    layer = undefined;
    layers = undefined;
    updateLayer = () => {};
    ready.value = false;
    coordinate.value = null;
  }

  const session = createMapSession(async () => {
    const L = await import("leaflet");
    return () => {
      if (!container.value) throw new Error("地图容器未就绪");
      try {
        map = L.map(container.value, {
          center,
          zoom: zoom.value,
          minZoom: mapConfig.minZoom,
          maxZoom: mapConfig.maxZoom,
          zoomControl: false,
        });
        layers = createMapLayerRegistry(map, () => L.layerGroup());
        const baseMap = layers.register("BaseMapLayer");
        drawing.attach(map, L, layers);
        L.control.zoom({ zoomInTitle: "放大", zoomOutTitle: "缩小" }).addTo(map);
        L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
        map.on("mousemove", (event: LeafletMouseEvent) => {
          const position = event.latlng.wrap();
          coordinate.value = { lng: position.lng, lat: position.lat };
        });
        map.on("mouseout movestart", () => {
          coordinate.value = null;
        });
        map.on("zoomend", () => {
          if (map) zoom.value = map.getZoom();
        });
        updateLayer = () => {
          if (!map) return;
          if (layer) {
            layer.off();
            baseMap.removeLayer(layer);
            layer = undefined;
          }
          error.value = "";
          if (!visible.value) return;
          const config = baseLayers.find((item) => item.id === selected.value) ?? baseLayers[0];
          layer = L.tileLayer(config.url, {
            attribution: config.attribution,
            maxZoom: mapConfig.maxZoom,
          });
          layer.on("tileerror", () => {
            error.value = "部分底图瓦片加载失败，请检查网络、切换底图或重试。";
          });
          layer.addTo(baseMap);
        };
        updateLayer();
        observer = new ResizeObserver(resize);
        observer.observe(container.value);
        ready.value = true;
        resize();
        return map;
      } catch (cause) {
        dispose();
        throw cause;
      }
    };
  }, dispose);

  async function start() {
    try {
      await session.start();
    } catch {
      error.value = "地图初始化失败，请重试。";
    }
  }
  function retry() {
    if (ready.value) updateLayer();
    else void start();
  }
  function resetView() {
    drawing.cancel();
    map?.setView(mapConfig.center, mapConfig.zoom);
  }
  watch([selected, visible], () => updateLayer());
  onMounted(start);
  onActivated(start);
  onDeactivated(() => session.stop());
  onBeforeUnmount(() => session.stop());
  return { coordinate, zoom, selected, visible, error, ready, retry, drawing, resetView };
}
