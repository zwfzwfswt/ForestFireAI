export type WeatherStatus = "online" | "offline" | "maintenance" | "warning";
export interface WeatherStation {
  id: string;
  name: string;
  code: string;
  longitude: number;
  latitude: number;
  altitude: number;
  status: WeatherStatus;
  organization: string;
  lastObservedAt: string;
  regionId: string;
  regionName: string;
  riskZoneId: string;
}
/** 温度 °C；湿度 %；风速 m/s；气象来向 °；降雨 mm；气压 hPa；能见度 km。 */
export interface WeatherObservation {
  stationId: string;
  observedAt: string;
  temperature: number | null;
  relativeHumidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitation1h: number | null;
  precipitation24h: number | null;
  pressure: number | null;
  soilMoisture: number | null;
  visibility: number | null;
}
export interface WeatherForecast {
  locationId: string;
  forecastAt: string;
  validAt: string;
  temperature: number | null;
  relativeHumidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitationProbability: number | null;
  precipitation: number | null;
  fireWeatherHint: string;
}
export type FactorKey =
  | "vegetation"
  | "moisture"
  | "temperature"
  | "humidity"
  | "wind"
  | "precipitation"
  | "terrain"
  | "history";
/** 0–100：越高对风险贡献越高；null 是缺测，禁止替换为零。 */
export interface RiskFactor {
  score: number | null;
  source: string;
  updatedAt: string;
}
export type FireRiskFactors = Record<FactorKey, RiskFactor>;
export type WeatherScenario = "baseline" | "dry" | "wet";
