import type { Map } from "leaflet";

// 语义层级区间不可跨越；同一区间内可调序。底图沿用 Leaflet tilePane（200）。
export const layerBands = {
  surface: [300, 349],
  boundary: [350, 399],
  road: [400, 449],
  mission: [450, 499],
  track: [500, 549],
  resource: [550, 599],
  fire: [600, 649],
  uav: [700, 749],
  interaction: [800, 849],
} as const;
export type LayerBand = keyof typeof layerBands;
export const drawingPane = "ff-drawing";
export const drawingLabelPane = "ff-drawing-label";

export function ensurePane(map: Map, name: string, zIndex: number) {
  const pane = map.getPane(name) ?? map.createPane(name);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = "none";
  return pane;
}
export function registerDrawingPanes(map: Map) {
  ensurePane(map, drawingPane, 900);
  ensurePane(map, drawingLabelPane, 910);
}
export function validZIndex(band: LayerBand, value: number) {
  const range = layerBands[band];
  return !!range && Number.isInteger(value) && value >= range[0] && value <= range[1];
}
