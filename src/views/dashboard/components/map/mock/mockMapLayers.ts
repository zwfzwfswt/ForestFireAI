import type { GeoJSONOptions } from "leaflet";

// 从已有 Leaflet 类型提取 GeoJSON 契约，无需增加直接依赖。
type MockFeature = Parameters<
  NonNullable<GeoJSONOptions<{ name: string; mock: true }>["filter"]>
>[0];
type Geometry = MockFeature["geometry"];
export type MockMapData = { type: "FeatureCollection"; features: MockFeature[] };
const collection = (...items: { name: string; geometry: Geometry }[]): MockMapData => ({
  type: "FeatureCollection",
  features: items.map(({ name, geometry }, index) => ({
    type: "Feature",
    id: index + 1,
    properties: { name: `${name}（Mock）`, mock: true },
    geometry,
  })),
});

// 虚构演示几何，非真实行政边界/设施/火情。GeoJSON WGS84：[经度, 纬度]。
export const mockMapLayers: Readonly<Record<string, MockMapData>> = {
  AdministrativeLayer: collection({
    name: "示范行政区",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [119.45, 30.08],
          [119.95, 30.08],
          [119.95, 30.42],
          [119.45, 30.42],
          [119.45, 30.08],
        ],
      ],
    },
  }),
  RoadLayer: collection({
    name: "示范防火道路",
    geometry: {
      type: "LineString",
      coordinates: [
        [119.48, 30.14],
        [119.61, 30.2],
        [119.73, 30.25],
        [119.91, 30.33],
      ],
    },
  }),
  FireEventLayer: collection(
    { name: "示范火点 A", geometry: { type: "Point", coordinates: [119.68, 30.27] } },
    { name: "示范火点 B", geometry: { type: "Point", coordinates: [119.82, 30.31] } }
  ),
  HighRiskLayer: collection({
    name: "示范高风险区",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [119.63, 30.22],
          [119.86, 30.22],
          [119.86, 30.36],
          [119.7, 30.38],
          [119.63, 30.22],
        ],
      ],
    },
  }),
  FireStationLayer: collection({
    name: "示范消防站",
    geometry: { type: "Point", coordinates: [119.57, 30.17] },
  }),
  WaterSourceLayer: collection({
    name: "示范水源",
    geometry: { type: "Point", coordinates: [119.78, 30.16] },
  }),
};
