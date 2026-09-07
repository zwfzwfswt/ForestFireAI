import { mapConfig } from "../dashboard/components/map/mapConfig";
import { productConfig } from "./config";
import { createMockFactors } from "../environment/mock";
import { assessRisk } from "../environment/model";
import type {
  RemoteSensingScene,
  RemoteSensingProduct,
  SatelliteHotspot,
  FireRiskZone,
  Satellite,
  ProductType,
  ProductStatus,
} from "./types";
// DEV / MOCK：所有影像、位置、指标均为虚构示意，无真实卫星数据和指数计算。
const time = (i: number) => new Date(Date.UTC(2026, 7, 24 + i, 4)).toISOString();
export function createMockScenes(): RemoteSensingScene[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `scene-${i + 1}`,
    name: `MOCK 林区影像 ${String(i + 1).padStart(2, "0")}`,
    satellite: (["sentinel2", "landsat", "modis", "viirs", "other"] as Satellite[])[i % 5],
    sensor: ["MSI", "OLI", "MODIS", "VIIRS", "DEMO"][i % 5],
    productLevel: "MOCK L2",
    acquiredAt: time(i),
    cloudCover: i * 9,
    resolution: [10, 30, 1000, 375, 100][i % 5],
    bbox: {
      west: mapConfig.center[1] - 0.28 + i * 0.012,
      south: mapConfig.center[0] - 0.2,
      east: mapConfig.center[1] + 0.28 + i * 0.012,
      north: mapConfig.center[0] + 0.2,
    },
    crs: "EPSG:4326",
    status: (
      [
        "ready",
        "ready",
        "ready",
        "available",
        "processing",
        "failed",
        "archived",
        "ready",
      ] as ProductStatus[]
    )[i],
    thumbnailUrl: "/mock/remote-sensing/rgb.svg",
    dataUrl: null,
    metadata: { mock: true, description: "仅用于前端展示的虚构影像目录；无原始影像可下载。" },
    createdAt: time(i),
    updatedAt: time(i),
  }));
}
export function createMockProducts(): RemoteSensingProduct[] {
  const types = Object.keys(productConfig) as ProductType[];
  return Array.from({ length: 12 }, (_, i) => {
    const type = types[i % types.length],
      config = productConfig[type];
    return {
      id: `product-${i + 1}`,
      sceneId: `scene-${i < 8 ? 1 : 2}`,
      name: `MOCK ${config.label} 产品 ${i + 1}`,
      type,
      generatedAt: time(Math.max(i % 8, i < 8 ? 0 : 1)),
      status: i === 10 ? "processing" : i === 11 ? "failed" : "ready",
      minValue: config.min,
      maxValue: config.max,
      unit: config.unit,
      rasterUrl: `/mock/remote-sensing/${type}.svg`,
      legend: {
        label: config.legend.label,
        stops: config.legend.stops.map((stop) => ({ ...stop })),
      },
      opacity: 0.65,
      visible: false,
    };
  });
}
export function createMockHotspots(): SatelliteHotspot[] {
  return Array.from({ length: 15 }, (_, i) => ({
    id: `hotspot-${i + 1}`,
    source: i % 3 === 0 ? "modis" : i % 3 === 1 ? "viirs" : "other",
    satellite: ["Terra (MOCK)", "Suomi NPP (MOCK)", "DEMO"][i % 3],
    sensor: ["MODIS", "VIIRS", "DEMO"][i % 3],
    longitude: mapConfig.center[1] - 0.23 + (i % 5) * 0.1,
    latitude: mapConfig.center[0] - 0.16 + Math.floor(i / 5) * 0.13,
    detectedAt: time(i % 8),
    confidence: i % 4 === 0 ? null : 0.55 + (i % 4) * 0.12,
    frp: i % 3 === 0 ? null : 12 + i * 2.4,
    brightness: i % 5 === 0 ? null : 310 + i,
    dayNight: i % 2 ? "night" : "day",
    status: "unreviewed",
    fireEventId: null,
    alertId: null,
  }));
}
export function createMockRiskZones(): FireRiskZone[] {
  return Array.from({ length: 8 }, (_, i) => {
    const factors = createMockFactors(i, time(i));
    const x = mapConfig.center[1] - 0.25 + (i % 4) * 0.13,
      y = mapConfig.center[0] - 0.18 + Math.floor(i / 4) * 0.2;
    return {
      id: `risk-${i + 1}`,
      name: `MOCK 火险分区 ${i + 1}`,
      ...assessRisk(factors),
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [x, y],
            [x + 0.1, y],
            [x + 0.09, y + 0.14],
            [x, y + 0.12],
            [x, y],
          ],
        ],
      },
      generatedAt: time(i),
      source: "MOCK 加权模型 V1（非行业标准）",
      factors,
    };
  });
}
