import type * as Leaflet from "leaflet";
import type { LayerDefinition } from "./layerDefinitions";
import { layerStyles, symbolHtml } from "./layerStyles";

// 所有 GeoJSON 子图形显式使用所属业务 pane，不能落到默认 marker/overlay pane。
export function createBusinessGeoJSON(
  L: typeof Leaflet,
  definition: LayerDefinition,
  data: Parameters<typeof Leaflet.geoJSON>[0],
  pane: string
) {
  const symbol = layerStyles[definition.symbol];
  return L.geoJSON(data, {
    pane,
    interactive: false,
    style: () => ({ ...symbol.path, color: symbol.color, pane, interactive: false }),
    pointToLayer: (feature, latlng) =>
      L.marker(latlng, {
        pane,
        shadowPane: pane,
        interactive: false,
        keyboard: false,
        title: String(feature.properties?.name ?? definition.name),
        icon: L.divIcon({
          className: "ff-business-symbol",
          html: symbolHtml(definition.symbol),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }),
  });
}
