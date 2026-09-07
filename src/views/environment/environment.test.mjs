import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
import ts from "typescript";
import {
  createContainer,
  createLeafletStub,
} from "../dashboard/components/map/testing/leafletStub.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  const source = ts
    .transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from ["']([^"']+)["']/g, (_, specifier) => {
      const target = specifier.startsWith(".")
        ? moduleUrl(resolve(dirname(file), `${specifier}.ts`))
        : import.meta.resolve(specifier);
      return `from ${JSON.stringify(target)}`;
    });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url);
  return url;
}
const load = (file) => import(moduleUrl(resolve(root, file)));
const { useWeatherStore } = await load("../../stores/weather.ts");
const { useForecastStore } = await load("../../stores/forecast.ts");
const { useFireRiskStore } = await load("../../stores/fireRisk.ts");
const { useRemoteSensingStore } = await load("../../stores/remoteSensing.ts");
const { createMockWeather, createMockForecasts, createMockFactors } = await load("mock.ts");
const {
  assessRisk,
  riskLevel,
  rankedFactors,
  validateFactors,
  validateWeights,
  windDirection,
  windText,
  weatherValue,
  factorsFromObservation,
} = await load("model.ts");
const { factorKeys, riskWeights, weatherStatuses } = await load("config.ts");
const { withEnvironmentMockMenu } = await load("mockMenu.ts");
const { useWeatherMapLayer } = await load(
  "../dashboard/components/map/composables/useWeatherMapLayer.ts"
);
const { useRemoteSensingLayers } = await load(
  "../dashboard/components/map/composables/useRemoteSensingLayers.ts"
);
const { createMapLayerRegistry } = await load(
  "../dashboard/components/map/layers/mapLayerRegistry.ts"
);
const { useBusinessLayers } = await load(
  "../dashboard/components/map/composables/useBusinessLayers.ts"
);
const { riskPopup } = await load("../remote-sensing/mapPopups.ts");
const { weatherPopup } = await load("mapPopup.ts");
function setup() {
  setActivePinia(createPinia());
  return {
    weather: useWeatherStore(),
    forecast: useForecastStore(),
    risk: useFireRiskStore(),
    remote: useRemoteSensingStore(),
  };
}
const now = Date.UTC(2026, 8, 7);
test("8 个站点、观测、4状态、2区域，坐标和观测时间一致", () => {
  const { stations, observations } = createMockWeather(now);
  assert.equal(stations.length, 8);
  assert.equal(observations.length, 8);
  assert.deepEqual(new Set(stations.map((s) => s.status)), new Set(Object.keys(weatherStatuses)));
  assert.equal(new Set(stations.map((s) => s.regionId)).size, 2);
  stations.forEach((s) => {
    assert.equal(s.lastObservedAt, observations.find((o) => o.stationId === s.id).observedAt);
    assert.ok(s.longitude > 119 && s.latitude > 30);
  });
});
test("缺失观测保持null，0不是缺测，Popup不泄漏HTML且显式单位", () => {
  const { weather } = setup(),
    o = weather.observations[0];
  assert.equal(o.precipitation1h, null);
  assert.equal(o.pressure, null);
  assert.equal(weatherValue(null), "--");
  assert.equal(weatherValue(0, "mm"), "0.0mm");
  const html = weatherPopup({ ...weather.stations[0], name: "<img src=x>" }, o);
  assert.ok(!html.includes("<img"));
  assert.match(html, /1h 降雨：--/);
  assert.match(html, /m\/s/);
});
test("风向八方位、22.5°边界、360°和空值", () => {
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].forEach((dir, i) =>
    assert.equal(windDirection(i * 45).code, dir)
  );
  assert.equal(windDirection(22.49).code, "N");
  assert.equal(windDirection(22.5).code, "NE");
  assert.equal(windDirection(360).code, "N");
  assert.equal(windDirection(-45).code, "NW");
  assert.match(windText(315), /西北风 NW 315°/);
  assert.equal(windText(null), "--");
  assert.equal(windDirection(NaN), null);
});
test("观测校验、未知站点、乱序拒绝，最新值不无限增长", () => {
  const { weather } = setup(),
    original = weather.observations[0];
  for (const fields of [
    { temperature: NaN },
    { relativeHumidity: 110 },
    { windSpeed: -1 },
    { precipitation24h: -1 },
    { windDirection: 361 },
    { stationId: "missing" },
    { observedAt: "bad" },
  ])
    assert.throws(() => weather.updateObservation({ ...original, ...fields }));
  assert.throws(() =>
    weather.updateObservation({
      ...original,
      observedAt: new Date(Date.parse(original.observedAt) - 1).toISOString(),
    })
  );
  for (let i = 0; i < 300; i++)
    weather.updateObservation({
      ...original,
      temperature: null,
      observedAt: new Date(Date.parse(original.observedAt) + i).toISOString(),
    });
  assert.equal(weather.observations.length, 8);
  assert.equal(weather.latestByStationId[original.stationId].temperature, null);
});
test("8地点的24h预报每3h有序，发布时间与有效时间区分，含缺测", () => {
  const forecasts = createMockForecasts(now);
  assert.equal(forecasts.length, 64);
  for (let location = 1; location <= 8; location++) {
    const rows = forecasts.filter((f) => f.locationId === `weather-${location}`);
    assert.equal(rows.length, 8);
    rows.forEach((f, i) => {
      assert.equal(Date.parse(f.forecastAt), now);
      assert.equal(Date.parse(f.validAt), now + (i + 1) * 3 * 3600000);
    });
  }
  assert.ok(forecasts.some((f) => f.relativeHumidity === null));
  assert.ok(forecasts.some((f) => f.precipitationProbability === null));
});
test("Forecast选站、跨页状态与reset恢复", () => {
  const { forecast } = setup();
  forecast.locationId = "weather-2";
  assert.equal(forecast.selectedForecasts.length, 8);
  assert.equal(useForecastStore(), forecast);
  forecast.reset();
  assert.equal(forecast.locationId, "weather-1");
  assert.equal(forecast.forecasts.length, 64);
});
test("八因子合法范围、来源时间校验，null不参与评分", () => {
  const factors = createMockFactors(0, new Date(now).toISOString());
  for (const key of factorKeys)
    for (const score of [-1, 101, NaN, Infinity, null, "50"])
      assert.throws(() => validateFactors({ ...factors, [key]: { ...factors[key], score } }));
  assert.throws(() =>
    validateFactors({ ...factors, wind: { score: 40, source: "", updatedAt: "bad" } })
  );
  assert.equal(Object.keys(factors).length, 8);
});
test("默认权重和为1，非法权重不悄悄归一化", () => {
  assert.ok(Math.abs(Object.values(riskWeights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  for (const value of [-1, NaN, Infinity, 0.7])
    assert.throws(() => validateWeights({ ...riskWeights, wind: value }));
});
test("已知因子加权评分、0/100端点与浮点舍入", () => {
  const factors = createMockFactors(0, new Date(now).toISOString());
  for (const score of [0, 50, 100]) {
    const values = Object.fromEntries(factorKeys.map((key) => [key, { ...factors[key], score }]));
    assert.equal(assessRisk(values).score, score);
  }
  const weighted = { ...factors, humidity: { ...factors.humidity, score: 92 } };
  const expected =
    Math.round(
      factorKeys.reduce((sum, key) => sum + weighted[key].score * riskWeights[key], 0) * 100
    ) / 100;
  assert.equal(assessRisk(weighted).score, expected);
});
test("风险等级阈值含边界，越界拒绝", () => {
  for (const [score, level] of [
    [0, "low"],
    [19.99, "low"],
    [20, "moderate"],
    [39.99, "moderate"],
    [40, "high"],
    [60, "very_high"],
    [80, "extreme"],
    [100, "extreme"],
  ])
    assert.equal(riskLevel(score), level);
  assert.throws(() => riskLevel(-1));
  assert.throws(() => riskLevel(101));
});
test("湿度与降雨贡献反向，高温/强风贡献同向，不改遥感因子", () => {
  const factors = createMockFactors(0, new Date(now).toISOString());
  const dry = factorsFromObservation(factors, createMockWeather(now, "dry").observations[0]);
  const wet = factorsFromObservation(factors, createMockWeather(now, "wet").observations[0]);
  for (const key of ["humidity", "precipitation", "temperature", "wind"])
    assert.ok(dry[key].score > wet[key].score);
  assert.equal(dry.moisture, factors.moisture);
  assert.match(dry.humidity.source, /weather-1/);
});
test("Top因素按加权贡献排，平分稳定，显示分值与权重", () => {
  const factors = createMockFactors(0, new Date(now).toISOString());
  factors.terrain.score = 100;
  factors.humidity.score = 80;
  const ranking = rankedFactors(factors);
  assert.equal(ranking[0].key, "humidity");
  assert.equal(ranking[0].contribution, 16);
  for (let i = 1; i < ranking.length; i++)
    assert.ok(ranking[i - 1].contribution >= ranking[i].contribution);
});
test("重新评估读取当前观测，单一风险数组、几何ID不变，刷新选中详情", () => {
  const { weather, risk } = setup(),
    previous = risk.riskZones;
  risk.select("risk-1");
  weather.applyScenario("dry");
  assert.equal(risk.riskZones, previous);
  const result = risk.reassess();
  assert.deepEqual(result, { updated: 8, failed: 0 });
  assert.ok(risk.selectedRiskZone.score > previous[0].score);
  assert.equal(risk.selectedRiskZone.geometry, previous[0].geometry);
  assert.equal(risk.riskZones[4].level, "extreme");
  weather.applyScenario("wet");
  risk.reassess();
  assert.ok(["low", "moderate"].includes(risk.riskZones[0].level));
});
test("关键气象缺测仅保留该区上次评估，其他区更新，无部分因子写入", () => {
  const { weather, risk } = setup(),
    previous = risk.riskZones[0];
  weather.updateObservation({ ...weather.observations[0], relativeHumidity: null });
  assert.deepEqual(risk.reassess(), { updated: 7, failed: 1 });
  assert.equal(risk.riskZones[0].score, previous.score);
  assert.equal(risk.riskZones[0].factors, previous.factors);
  assert.ok(risk.riskZones[0].assessmentError);
  assert.match(riskPopup(risk.riskZones[0]), /缺测/);
});
test("Dashboard极高/最高/平均从同一Store派生，空集为null", () => {
  const { risk } = setup();
  assert.equal(risk.extremeRiskCount, 1);
  assert.equal(risk.highRiskCount, 4);
  assert.equal(risk.maximumScore, Math.max(...risk.riskZones.map((z) => z.score)));
  assert.equal(risk.averageScore, risk.riskZones.reduce((sum, z) => sum + z.score, 0) / 8);
  risk.riskZones = [];
  assert.equal(risk.maximumScore, null);
  assert.equal(risk.averageScore, null);
  assert.equal(risk.extremeRiskCount, 0);
});
function mapSetup() {
  const stores = setup(),
    { L } = createLeafletStub(),
    map = L.map(createContainer()),
    scope = effectScope(),
    drawing = ref(false);
  const adapter = scope.run(() => useWeatherMapLayer(() => drawing.value)),
    remote = scope.run(() => useRemoteSensingLayers(() => drawing.value));
  const business = useBusinessLayers(),
    registry = createMapLayerRegistry(map, L.layerGroup, business.publish);
  business.attach(registry, L, {
    WeatherStationLayer: adapter.factory(L),
    RemoteSensingLayer: remote.factory(L, "RemoteSensingLayer"),
    FireRiskLayer: remote.factory(L, "FireRiskLayer"),
    SatelliteHotspotLayer: remote.factory(L, "SatelliteHotspotLayer"),
  });
  adapter.attach(map, L, registry);
  remote.attach(map, L, registry);
  const members = (id) => registry.get(id).getLayers()[0].getLayers();
  const cleanup = () => {
    adapter.detach();
    remote.detach();
    registry.dispose();
    scope.stop();
  };
  return { ...stores, L, map, adapter, registry, members, drawing, cleanup };
}
test("WeatherStationLayer 8 Marker与Wind元数据，状态符号、显隐透明度、定位", () => {
  const m = mapSetup();
  try {
    const markers = m.members("WeatherStationLayer");
    assert.equal(markers.length, 8);
    assert.equal(m.registry.getState("WeatherStationLayer").zIndex, 590);
    assert.equal(m.registry.get("WindLayer"), undefined);
    assert.equal(new Set(markers.map((x) => x.options.icon.html)).size, 4);
    m.registry.hide("WeatherStationLayer");
    assert.ok(!m.map.hasLayer(markers[0]));
    m.registry.setOpacity("WeatherStationLayer", 0);
    m.weather.locate("weather-1");
    assert.ok(m.map.hasLayer(markers[0]));
    assert.equal(m.registry.getState("WeatherStationLayer").opacity, 1);
    assert.ok(markers[0].popupOpen);
    assert.equal(m.weather.locateRequest, null);
  } finally {
    m.cleanup();
  }
});
test("观测更新复用Marker，绘制不抢选中，detach停止监听", () => {
  const m = mapSetup();
  try {
    const marker = m.members("WeatherStationLayer")[0];
    m.weather.applyScenario("dry");
    assert.equal(m.members("WeatherStationLayer")[0], marker);
    assert.match(marker.popup.content, /40.0°C/);
    m.drawing.value = true;
    marker.fire("click");
    assert.equal(m.weather.selectedId, null);
    assert.equal(marker.popup, undefined);
    m.drawing.value = false;
    marker.fire("click");
    assert.equal(m.weather.selectedId, "weather-1");
    m.adapter.detach();
    assert.equal(marker.events.size, 0);
    m.weather.applyScenario("wet");
  } finally {
    m.cleanup();
  }
});
test("FireRiskLayer评估更新复用Polygon及解释，不影响Drawing/遥感/Fire", () => {
  const m = mapSetup();
  try {
    m.remote.toggle("product-2", true);
    const image = m.members("RemoteSensingLayer")[0],
      polygon = m.members("FireRiskLayer")[0];
    const group = m.registry.register("DrawingLayer");
    m.L.circleMarker([30, 119], {}).addTo(group);
    const fire = m.registry.get("FireEventLayer"),
      before = polygon.popup.content;
    m.weather.applyScenario("dry");
    m.risk.reassess();
    assert.equal(m.members("FireRiskLayer")[0], polygon);
    assert.notEqual(polygon.popup.content, before);
    assert.match(polygon.popup.content, /加权贡献/);
    assert.match(polygon.popup.content, /低湿度/);
    assert.equal(m.members("RemoteSensingLayer")[0], image);
    assert.equal(group.getLayers().length, 1);
    assert.equal(m.registry.get("FireEventLayer"), fire);
    m.registry.clear("DrawingLayer");
    assert.equal(m.members("WeatherStationLayer").length, 8);
    assert.ok(m.map.hasLayer(image));
  } finally {
    m.cleanup();
  }
});
test("reset清理选择、请求和场景，不改业务实体数量，退出/租户入口顺序正确", () => {
  const { weather, forecast, risk } = setup();
  weather.locate("weather-1");
  weather.applyScenario("dry");
  risk.reassess();
  weather.reset();
  forecast.reset();
  risk.reset();
  assert.equal(weather.selectedId, null);
  assert.equal(weather.locateRequest, null);
  assert.equal(weather.scenario, "baseline");
  assert.equal(risk.highRiskCount, 4);
  for (const file of ["user.ts", "tenant.ts"]) {
    const text = readFileSync(resolve(root, "../../stores", file), "utf8");
    assert.ok(
      text.indexOf("useWeatherStore(store).reset()") <
        text.indexOf("useFireRiskStore(store).reset()")
    );
    assert.ok(text.includes("useForecastStore(store).reset()"));
  }
});
test("三个环境菜单沿用动态路由，冲突保留、无重复", () => {
  const routes = withEnvironmentMockMenu([]);
  assert.equal(routes[0].children.length, 3);
  assert.equal(withEnvironmentMockMenu(routes), routes);
  for (const child of routes[0].children)
    assert.ok(
      readFileSync(resolve(root, "..", child.component + ".vue"), "utf8").includes("defineOptions")
    );
});
