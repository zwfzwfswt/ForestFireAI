import { mapConfig } from "../dashboard/components/map/mapConfig";
import { factorKeys, weatherConfig } from "./config";
import type {
  WeatherStation,
  WeatherObservation,
  WeatherForecast,
  WeatherScenario,
  FireRiskFactors,
} from "./types";
// 所有站点、观测、预报与来源均为 DEV / MOCK，不代表真实地理设施或观测。
const demoScores = [10, 30, 50, 70, 95, 15, 35, 55];
export function createMockWeather(now = Date.now(), scenario: WeatherScenario = "baseline") {
  const stations: WeatherStation[] = [],
    observations: WeatherObservation[] = [];
  demoScores.forEach((baseline, i) => {
    const score = scenario === "dry" ? 100 : scenario === "wet" ? 5 : baseline;
    const observedAt = new Date(
      now - (i === 2 ? 7200000 : i === 3 ? 3600000 : i * 60000)
    ).toISOString();
    const station: WeatherStation = {
      id: `weather-${i + 1}`,
      code: `WX${String(i + 1).padStart(3, "0")}`,
      name: `MOCK 气象站 ${i + 1}`,
      longitude: mapConfig.center[1] - 0.2 + (i % 4) * 0.13,
      latitude: mapConfig.center[0] - 0.1 + Math.floor(i / 4) * 0.2,
      altitude: 120 + i * 55,
      status: (["online", "warning", "offline", "maintenance"] as const)[i % 4],
      organization: "Mock 林区管护站",
      lastObservedAt: observedAt,
      regionId: i < 4 ? "north" : "south",
      regionName: i < 4 ? "北部示范区" : "南部示范区",
      riskZoneId: `risk-${i + 1}`,
    };
    stations.push(station);
    observations.push({
      stationId: station.id,
      observedAt,
      temperature: score * 0.4,
      relativeHumidity: 100 - score,
      windSpeed: score * 0.2,
      windDirection: i === 0 ? null : i * 45,
      precipitation1h: i === 0 ? null : (100 - score) / 20,
      precipitation24h: (100 - score) / 5,
      pressure: i === 0 ? null : 990 + i,
      soilMoisture: i % 2 ? null : 100 - score,
      visibility: i % 3 ? 12 : null,
    });
  });
  return { stations, observations };
}
export function createMockForecasts(now = Date.now()): WeatherForecast[] {
  const forecastAt = new Date(now).toISOString();
  return demoScores.flatMap((base, i) =>
    Array.from(
      { length: weatherConfig.forecastHours / weatherConfig.forecastStepHours },
      (_, step) => ({
        locationId: `weather-${i + 1}`,
        forecastAt,
        validAt: new Date(
          now + (step + 1) * weatherConfig.forecastStepHours * 3600000
        ).toISOString(),
        temperature: 12 + base * 0.25 + Math.sin((step * Math.PI) / 4) * 4,
        relativeHumidity:
          step === 2 && i === 0 ? null : Math.max(5, 95 - base * 0.7 + Math.cos(step) * 5),
        windSpeed: 1 + base * 0.12 + step * 0.3,
        windDirection: (i * 45 + step * 15) % 360,
        precipitationProbability: i === 0 && step === 1 ? null : Math.max(0, 90 - base),
        precipitation: Math.max(0, (50 - base) / 10),
        fireWeatherHint: base >= 70 ? "MOCK 干热风大，注意核查" : "MOCK 常规环境样例",
      })
    )
  );
}
export function createMockFactors(index: number, updatedAt: string): FireRiskFactors {
  const score = demoScores[index % demoScores.length];
  const sources = {
    vegetation: "Remote Sensing",
    moisture: "NDMI / weather",
    temperature: "Weather / LST",
    humidity: "Weather",
    wind: "Weather",
    precipitation: "Weather",
    terrain: "DEM",
    history: "Historical Fire",
  };
  return Object.fromEntries(
    factorKeys.map((key) => [
      key,
      {
        score: Math.min(100, score + (key === "moisture" ? 3 : key === "vegetation" ? 1 : 0)),
        source: `${sources[key]} · MOCK 因子样例`,
        updatedAt,
      },
    ])
  ) as FireRiskFactors;
}
