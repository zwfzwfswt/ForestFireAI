import type { LayerBand } from "./layerPanes";
import type { LayerSymbol } from "./layerStyles";

export const layerCategories = [
  { id: "geography", name: "基础地理" },
  { id: "forest", name: "森林资源" },
  { id: "monitoring", name: "火灾监测" },
  { id: "uav", name: "无人机" },
  { id: "risk", name: "火险信息" },
  { id: "resources", name: "应急资源" },
] as const;
export type LayerCategory = (typeof layerCategories)[number]["id"];
export type BusinessLayerType = "marker" | "polyline" | "polygon" | "geojson" | "raster";
export interface LayerDefinition {
  id: string;
  name: string;
  category: LayerCategory;
  visible: boolean;
  opacity: number;
  zIndex: number;
  type: BusinessLayerType;
  band: LayerBand;
  symbol: LayerSymbol;
  source: "mock" | "unconfigured";
}
const define = (
  id: string,
  name: string,
  category: LayerCategory,
  type: BusinessLayerType,
  band: LayerBand,
  zIndex: number,
  symbol: LayerSymbol,
  mock = false
): LayerDefinition => ({
  id,
  name,
  category,
  type,
  band,
  zIndex,
  symbol,
  visible: mock,
  opacity: 1,
  source: mock ? "mock" : "unconfigured",
});

// 未配置项只有目录元数据，不创建空 Leaflet 业务组，也不接入业务服务。
export const layerDefinitions: readonly LayerDefinition[] = [
  define(
    "AdministrativeLayer",
    "行政区划",
    "geography",
    "polygon",
    "boundary",
    350,
    "boundary",
    true
  ),
  define("RoadLayer", "道路", "geography", "polyline", "road", 410, "road", true),
  define("WaterwayLayer", "水系", "geography", "geojson", "boundary", 355, "water"),
  define("ForestExtentLayer", "林地范围", "forest", "polygon", "boundary", 360, "forest"),
  define("ForestCompartmentLayer", "林班", "forest", "polygon", "boundary", 365, "forest"),
  define("ForestSubcompartmentLayer", "小班", "forest", "polygon", "boundary", 370, "forest"),
  define("VegetationLayer", "植被类型", "forest", "geojson", "boundary", 375, "forest"),
  define("FireEventLayer", "当前火情", "monitoring", "marker", "fire", 620, "fire", true),
  define("AIAlertLayer", "AI 告警", "monitoring", "marker", "interaction", 820, "alert"),
  define("FireAlertLayer", "统一告警", "monitoring", "marker", "interaction", 810, "alert"),
  define("HistoricalFireLayer", "历史火点", "monitoring", "marker", "fire", 610, "history"),
  define("SatelliteHotspotLayer", "卫星火点", "monitoring", "marker", "fire", 600, "hotspot"),
  define("RemoteSensingLayer", "遥感产品", "forest", "raster", "surface", 300, "raster"),
  define("UAVLayer", "UAV", "uav", "marker", "uav", 720, "uav"),
  define("UAVTrackLayer", "UAV 飞行轨迹", "uav", "polyline", "track", 520, "track"),
  define("MissionLayer", "UAV 任务区域", "uav", "polygon", "mission", 470, "mission"),
  define("FireRiskLayer", "火险等级", "risk", "raster", "surface", 310, "risk"),
  define("HighRiskLayer", "高风险区域", "risk", "polygon", "surface", 320, "risk", true),
  define("FireStationLayer", "消防站", "resources", "marker", "resource", 570, "station", true),
  define("WaterSourceLayer", "水源", "resources", "marker", "resource", 560, "water", true),
  define("ShelterLayer", "避险点", "resources", "marker", "resource", 580, "shelter"),
];
