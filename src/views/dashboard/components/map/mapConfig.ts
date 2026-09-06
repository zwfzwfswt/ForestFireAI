import type { LatLngTuple } from "leaflet";

// 演示初始视角，不代表已选定试点林区。Leaflet 顺序：[纬度, 经度]，WGS84。
export const mapConfig = {
  center: [30.25, 119.7] as LatLngTuple,
  zoom: 9,
  minZoom: 2,
  maxZoom: 18,
  defaultBaseLayer: "osm",
};

// 外部瓦片不经过业务 Axios，不发送登录 Token。上线前核对供应商授权与可用性。
export const baseLayers = [
  {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: "satellite",
    name: "卫星影像 · Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
] as const;
