import { ref, watch } from "vue";
import type * as Leaflet from "leaflet";
import type { LayerGroup, ImageOverlay, Marker, Polygon, Map as LeafletMap } from "leaflet";
import { useRemoteSensingStore } from "../../../../../stores/remoteSensing";
import { useSatelliteHotspotStore } from "../../../../../stores/satelliteHotspot";
import { useFireRiskStore } from "../../../../../stores/fireRisk";
import { leafletBounds } from "../../../../remote-sensing/model";
import { productLayerId, hotspotStyle, riskLevels } from "../../../../remote-sensing/config";
import { hotspotPopup, riskPopup } from "../../../../remote-sensing/mapPopups";
import type { MapLayerRegistry } from "../layers/mapLayerRegistry";

// Leaflet 实例只属于本次地图会话。产品透明度与 Registry 整组透明度相乘。
export function useRemoteSensingLayers(isDrawing: () => boolean) {
  const catalog = useRemoteSensingStore(),
    hotspots = useSatelliteHotspotStore(),
    risks = useFireRiskStore();
  const rasters = new Map<string, ImageOverlay>();
  const markers = new Map<string, Marker>();
  const polygons = new Map<string, Polygon>();
  const groups = new Map<string, LayerGroup>();
  const panes = new Map<string, string>();
  const errors = ref<Record<string, string>>({});
  let stop: (() => void) | undefined;
  function syncRasters(L: typeof Leaflet, id: string) {
    const group = groups.get(id);
    if (!group) return;
    for (const p of catalog.products.filter((p) => productLayerId(p.type) === id)) {
      let overlay = rasters.get(p.id);
      const scene = catalog.scenes.find((s) => s.id === p.sceneId);
      if (!scene) continue;
      if (!overlay && p.visible) {
        overlay = L.imageOverlay(p.rasterUrl, leafletBounds(scene.bbox), {
          pane: panes.get(id),
          opacity: p.opacity,
          zIndex: -1,
          interactive: false,
          alt: `${p.name} · MOCK / DEMO`,
          className: "ff-mock-raster",
        });
        overlay.on("error", () => {
          errors.value = { ...errors.value, [p.id]: `${p.name} 加载失败，请隐藏后重新显示` };
        });
        overlay.on("load", () => {
          const next = { ...errors.value };
          delete next[p.id];
          errors.value = next;
        });
        rasters.set(p.id, overlay);
      }
      if (!overlay) continue;
      overlay.setOpacity(p.opacity);
      if (p.visible) {
        group.addLayer(overlay);
        overlay.bringToFront();
      } else {
        group.removeLayer(overlay);
        // 隐藏后释放引用及监听器，再次显示可重试失败的本地图片。
        overlay.off();
        rasters.delete(p.id);
        const next = { ...errors.value };
        delete next[p.id];
        errors.value = next;
      }
    }
    // Reset 或未来目录替换后移除已经不存在的产品。
    rasters.forEach((overlay, key) => {
      if (!catalog.products.some((p) => p.id === key)) {
        groups.forEach((owner) => owner.removeLayer(overlay));
        overlay.off();
        rasters.delete(key);
      }
    });
  }
  function syncHotspots(L: typeof Leaflet) {
    const group = groups.get("SatelliteHotspotLayer"),
      pane = panes.get("SatelliteHotspotLayer");
    if (!group) return;
    markers.forEach((marker, id) => {
      if (!hotspots.hotspots.some((h) => h.id === id)) {
        marker.closePopup().unbindPopup().off();
        group.removeLayer(marker);
        markers.delete(id);
      }
    });
    for (const h of hotspots.hotspots) {
      let marker = markers.get(h.id);
      if (!marker) {
        marker = L.marker([h.latitude, h.longitude], {
          pane,
          shadowPane: pane,
          bubblingMouseEvents: true,
          title: `${h.id} · MOCK 卫星热异常`,
          icon: L.divIcon({
            className: "ff-hotspot-symbol",
            html: `<span style="display:grid;place-items:center;border:2px solid #fff;border-radius:50%;width:16px;height:16px;background:${hotspotStyle.color};color:#722300;box-shadow:0 0 0 4px #ff7b2244">${hotspotStyle.glyph}</span>`,
            iconSize: [hotspotStyle.size, hotspotStyle.size],
            iconAnchor: [10, 10],
          }),
        }).addTo(group);
        marker.on("click", () => {
          if (!isDrawing()) hotspots.select(h.id);
        });
        markers.set(h.id, marker);
      }
      marker.setLatLng([h.latitude, h.longitude]);
      marker.closePopup().unbindPopup();
      if (!isDrawing()) marker.bindPopup(hotspotPopup(h), { pane, autoPan: false });
    }
  }
  function syncRisks(L: typeof Leaflet) {
    const group = groups.get("FireRiskLayer"),
      pane = panes.get("FireRiskLayer");
    if (!group) return;
    polygons.forEach((polygon, id) => {
      if (!risks.riskZones.some((z) => z.id === id)) {
        polygon.closePopup().unbindPopup().off();
        group.removeLayer(polygon);
        polygons.delete(id);
      }
    });
    for (const z of risks.riskZones) {
      const points = z.geometry.coordinates.map((ring) =>
        ring.map(([lng, lat]): [number, number] => [lat, lng])
      );
      let polygon = polygons.get(z.id);
      if (!polygon) {
        polygon = L.polygon(points, {
          pane,
          color: riskLevels[z.level].color,
          weight: 2,
          fillOpacity: 0.3,
          bubblingMouseEvents: true,
          className: "ff-risk-zone",
        }).addTo(group);
        polygon.on("click", () => {
          if (!isDrawing()) risks.select(z.id);
        });
        polygons.set(z.id, polygon);
      } else {
        polygon.setLatLngs(points);
        polygon.setStyle({ color: riskLevels[z.level].color });
      }
      polygon.closePopup().unbindPopup();
      if (!isDrawing()) polygon.bindPopup(riskPopup(z), { pane, autoPan: false });
    }
  }
  function factory(
    L: typeof Leaflet,
    id: "RemoteSensingLayer" | "FireRiskLayer" | "SatelliteHotspotLayer"
  ) {
    return (pane: string) => {
      const group = L.layerGroup();
      groups.set(id, group);
      panes.set(id, pane);
      if (id === "SatelliteHotspotLayer") syncHotspots(L);
      else {
        syncRasters(L, id);
        if (id === "FireRiskLayer") syncRisks(L);
      }
      return { layer: group, featureCount: group.getLayers().length };
    };
  }
  function attach(map: LeafletMap, L: typeof Leaflet, registry: MapLayerRegistry) {
    stop?.();
    function update() {
      syncRasters(L, "RemoteSensingLayer");
      syncRasters(L, "FireRiskLayer");
      syncRisks(L);
      syncHotspots(L);
      groups.forEach((group, id) => registry.setFeatureCount(id, group.getLayers().length));
    }
    function reveal(id: string) {
      registry.show(id);
      if (registry.getState(id)?.opacity === 0) registry.setOpacity(id, 1);
    }
    const watchers = [
      watch(
        () => [catalog.products, catalog.scenes, risks.riskZones, hotspots.hotspots, isDrawing()],
        update,
        { flush: "sync" }
      ),
      watch(
        () => catalog.locateRequest,
        (request) => {
          if (!request) return;
          const product =
            request.kind === "product"
              ? catalog.products.find((p) => p.id === request.id)
              : undefined;
          const scene = catalog.scenes.find((s) => s.id === (product?.sceneId ?? request.id));
          if (scene) {
            if (product) reveal(productLayerId(product.type));
            map.fitBounds(leafletBounds(scene.bbox), { animate: false, padding: [20, 20] });
          }
          catalog.consumeLocate(request.token);
        },
        { immediate: true, flush: "sync" }
      ),
      watch(
        () => hotspots.locateRequest,
        (request) => {
          if (!request) return;
          const h = hotspots.hotspots.find((h) => h.id === request.id);
          if (h) {
            reveal("SatelliteHotspotLayer");
            map.flyTo([h.latitude, h.longitude], Math.max(13, map.getZoom()), { animate: false });
            if (!isDrawing()) markers.get(h.id)?.openPopup();
          }
          hotspots.consumeLocate(request.token);
        },
        { immediate: true, flush: "sync" }
      ),
      watch(
        () => risks.locateRequest,
        (request) => {
          if (!request) return;
          const polygon = polygons.get(request.id);
          if (polygon) {
            reveal("FireRiskLayer");
            map.fitBounds(polygon.getBounds(), { animate: false, padding: [20, 20] });
            if (!isDrawing()) polygon.openPopup();
          }
          risks.consumeLocate(request.token);
        },
        { immediate: true, flush: "sync" }
      ),
    ];
    stop = () => watchers.forEach((unwatch) => unwatch());
  }
  function detach() {
    stop?.();
    stop = undefined;
    markers.forEach((m) => m.closePopup().unbindPopup().off());
    polygons.forEach((p) => p.closePopup().unbindPopup().off());
    rasters.forEach((r) => r.off());
    groups.forEach((g) => g.clearLayers());
    groups.clear();
    panes.clear();
    markers.clear();
    polygons.clear();
    rasters.clear();
    errors.value = {};
  }
  return { factory, attach, detach, errors };
}
