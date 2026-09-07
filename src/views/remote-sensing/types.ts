import type { GeoJSONOptions } from "leaflet";
import type { FireRiskFactors } from "../environment/types";
type Geometry = Parameters<NonNullable<GeoJSONOptions["filter"]>>[0]["geometry"];
type Polygon = Extract<Geometry, { type: "Polygon" }>;

export type Satellite = "sentinel2" | "landsat" | "modis" | "viirs" | "other";
export type ProductStatus = "available" | "processing" | "ready" | "failed" | "archived";
export type ProductType = "rgb" | "ndvi" | "ndmi" | "ndwi" | "nbr" | "nbr2" | "lst" | "fire_risk";
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}
export interface Legend {
  label: string;
  stops: { label: string; color: string }[];
}
export interface RemoteSensingScene {
  id: string;
  name: string;
  satellite: Satellite;
  sensor: string;
  productLevel: string;
  acquiredAt: string;
  cloudCover: number;
  resolution: number;
  bbox: Bounds;
  crs: string;
  status: ProductStatus;
  thumbnailUrl: string;
  dataUrl: string | null;
  metadata: { mock: true; description: string };
  createdAt: string;
  updatedAt: string;
}
export interface RemoteSensingProduct {
  id: string;
  sceneId: string;
  name: string;
  type: ProductType;
  generatedAt: string;
  status: ProductStatus;
  minValue: number;
  maxValue: number;
  unit: string;
  rasterUrl: string;
  legend: Legend;
  opacity: number;
  visible: boolean;
}
export interface SatelliteHotspot {
  id: string;
  source: "viirs" | "modis" | "other";
  satellite: string;
  sensor: string;
  longitude: number;
  latitude: number;
  detectedAt: string;
  confidence: number | null;
  frp: number | null;
  brightness: number | null;
  dayNight: "day" | "night";
  status: "unreviewed" | "alert_created";
  fireEventId: string | null;
  alertId: string | null;
}
export type RiskLevel = "low" | "moderate" | "high" | "very_high" | "extreme";
export interface FireRiskZone {
  id: string;
  name: string;
  level: RiskLevel;
  geometry: Polygon;
  score: number;
  generatedAt: string;
  source: string;
  factors: FireRiskFactors;
  assessmentError?: string;
}
export interface CatalogQuery {
  keyword: string;
  satellite: string;
  sensor: string;
  type: string;
  status: string;
  from: string;
  to: string;
  maxCloud: number | null;
}
export interface HotspotQuery {
  source: string;
  from: string;
  to: string;
  confidence: "" | "unknown" | "high" | "lower";
  alert: "" | "yes" | "no";
  event: "" | "yes" | "no";
}
