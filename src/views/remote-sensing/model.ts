import type {
  Bounds,
  CatalogQuery,
  HotspotQuery,
  RemoteSensingProduct,
  RemoteSensingScene,
  SatelliteHotspot,
} from "./types";
export const emptyCatalogQuery = (): CatalogQuery => ({
  keyword: "",
  satellite: "",
  sensor: "",
  type: "",
  status: "",
  from: "",
  to: "",
  maxCloud: null,
});
export const emptyHotspotQuery = (): HotspotQuery => ({
  source: "",
  from: "",
  to: "",
  confidence: "",
  alert: "",
  event: "",
});
export const inDates = (value: string, from: string, to: string) =>
  (!from || Date.parse(value) >= Date.parse(from)) && (!to || Date.parse(value) <= Date.parse(to));
export const filterScenes = (items: readonly RemoteSensingScene[], q: CatalogQuery) =>
  items.filter(
    (s) =>
      s.name.toLowerCase().includes(q.keyword.trim().toLowerCase()) &&
      (!q.satellite || s.satellite === q.satellite) &&
      (!q.sensor || s.sensor === q.sensor) &&
      (!q.status || s.status === q.status) &&
      (q.maxCloud === null || s.cloudCover <= q.maxCloud) &&
      inDates(s.acquiredAt, q.from, q.to)
  );
export const filterProducts = (items: readonly RemoteSensingProduct[], q: CatalogQuery) =>
  items.filter(
    (p) =>
      p.name.toLowerCase().includes(q.keyword.trim().toLowerCase()) &&
      (!q.type || p.type === q.type) &&
      (!q.status || p.status === q.status) &&
      inDates(p.generatedAt, q.from, q.to)
  );
export const filterHotspots = (items: readonly SatelliteHotspot[], q: HotspotQuery) =>
  items.filter(
    (h) =>
      (!q.source || h.source === q.source) &&
      inDates(h.detectedAt, q.from, q.to) &&
      (!q.confidence ||
        (q.confidence === "unknown"
          ? h.confidence === null
          : h.confidence !== null &&
            (q.confidence === "high" ? h.confidence >= 0.8 : h.confidence < 0.8))) &&
      (!q.alert || !!h.alertId === (q.alert === "yes")) &&
      (!q.event || !!h.fireEventId === (q.event === "yes"))
  );
export function validateOpacity(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("透明度必须在 0–1 之间");
  return value;
}
export const leafletBounds = (b: Bounds): [[number, number], [number, number]] => [
  [b.south, b.west],
  [b.north, b.east],
];
export const boundsText = (b: Bounds) =>
  `${b.west.toFixed(3)}, ${b.south.toFixed(3)} — ${b.east.toFixed(3)}, ${b.north.toFixed(3)}`;
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
