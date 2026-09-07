import type { PathOptions } from "leaflet";

// 颜色、符号、线宽和面填充集中维护。图标文字区分语义，不只依赖颜色。
export const layerStyles = {
  raster: { color: "#237a42", glyph: "影", path: { weight: 1 } },
  hotspot: { color: "#fd6b22", glyph: "●", path: { weight: 2 } },
  boundary: {
    color: "#64748b",
    glyph: "界",
    path: { weight: 2, fillOpacity: 0.04, dashArray: "6 4" },
  },
  road: { color: "#b7791f", glyph: "路", path: { weight: 4 } },
  water: { color: "#0284c7", glyph: "水", path: { weight: 2, fillOpacity: 0.3 } },
  forest: { color: "#15803d", glyph: "林", path: { weight: 2, fillOpacity: 0.2 } },
  fire: { color: "#dc2626", glyph: "火", path: { weight: 2, fillOpacity: 0.3 } },
  alert: { color: "#ea580c", glyph: "警", path: { weight: 2, fillOpacity: 0.2 } },
  history: { color: "#78716c", glyph: "史", path: { weight: 2 } },
  uav: { color: "#7c3aed", glyph: "机", path: { weight: 3 } },
  track: { color: "#8b5cf6", glyph: "迹", path: { weight: 3, dashArray: "5 4" } },
  mission: { color: "#6366f1", glyph: "任", path: { weight: 2, fillOpacity: 0.12 } },
  risk: { color: "#ef7d16", glyph: "险", path: { weight: 2, fillOpacity: 0.35, dashArray: "5 3" } },
  station: { color: "#be123c", glyph: "站", path: { weight: 2 } },
  shelter: { color: "#0d9488", glyph: "避", path: { weight: 2 } },
} satisfies Record<string, { color: string; glyph: string; path: PathOptions }>;
export type LayerSymbol = keyof typeof layerStyles;

export function symbolHtml(symbol: LayerSymbol) {
  const style = layerStyles[symbol];
  // 仅插入受控样式常量；GeoJSON 属性不拼接到 HTML。
  return `<span style="display:grid;place-items:center;width:24px;height:24px;border:2px solid white;border-radius:6px;background:${style.color};color:white;font:bold 13px sans-serif;box-shadow:0 1px 4px #0005">${style.glyph}</span>`;
}
