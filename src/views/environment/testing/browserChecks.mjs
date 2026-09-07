// 本地真实 Vue / Element Plus / ECharts / Leaflet 验证；没有真实气象请求。
export async function runEnvironmentBrowserChecks({
  weather,
  forecast,
  risk,
  remote,
  router,
  nextTick,
  echarts,
}) {
  const passed = [];
  let step = "气象页面";
  const check = (value, message) => {
    if (!value) throw new Error(`${step}: ${message}`);
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`${step}: 等待超时`);
  };
  const visible = (el) =>
    el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden";
  const button = async (label, scope = document) => {
    let target;
    await waitFor(
      () =>
        (target = [...scope.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === label && !b.disabled && visible(b)
        ))
    );
    target.click();
    await nextTick();
  };
  const choose = async (label, text) => {
    const el = [...document.querySelectorAll(`[aria-label="${label}"]`)].find(visible);
    check(el, label);
    el.closest(".el-select").querySelector(".el-select__wrapper").click();
    await nextTick();
    let option;
    await waitFor(
      () =>
        (option = [...document.querySelectorAll(".el-select-dropdown__item")].find(
          (o) => visible(o) && o.textContent.trim() === text
        ))
    );
    option.click();
    await nextTick();
  };
  const rows = (css) => [...document.querySelectorAll(`${css} .el-table__body-wrapper tbody tr`)];
  const state = () => document.querySelector(".forest-map")?.__vueParentComponent.setupState;
  const pane = (id) => document.querySelector(`.leaflet-ff-business-${id}-pane`);
  const close = async () => {
    document.querySelector(".remote-detail .el-drawer__close-btn").click();
    await nextTick();
  };
  try {
    weather.reset();
    forecast.reset();
    risk.reset();
    await router.push("/environment/weather");
    await waitFor(() => rows(".weather-page").length === 8);
    await waitFor(() => rows(".weather-page")[0]?.textContent.includes("--"));
    await choose("气象状态筛选", "在线");
    check(rows(".weather-page").length === 2, "状态筛选");
    await choose("气象区域筛选", "北部示范区");
    check(rows(".weather-page").length === 1, "区域筛选");
    await button("详情", rows(".weather-page")[0]);
    check(
      document.querySelector(".remote-detail").textContent.includes("hPa") ||
        document.querySelector(".remote-detail").textContent.includes("pressure"),
      "详情气压"
    );
    await close();
    await button("地图定位", rows(".weather-page")[0]);
    await waitFor(
      () =>
        state()?.ready &&
        pane("WeatherStationLayer")?.querySelectorAll(".ff-weather-symbol").length === 8
    );
    check(pane("WeatherStationLayer").textContent.includes("1h 降雨：--"), "Popup缺测");
    check(weather.locateRequest === null, "定位请求未消费");
    state().business.setVisible("WeatherStationLayer", false);
    await nextTick();
    check(!pane("WeatherStationLayer").querySelector(".ff-weather-symbol"), "气象层隐藏失败");
    state().business.setVisible("WeatherStationLayer", true);
    state().business.setOpacity("WeatherStationLayer", 0.4);
    await nextTick();
    check(
      pane("WeatherStationLayer").querySelectorAll(".ff-weather-symbol").length === 8 &&
        pane("WeatherStationLayer").style.opacity === "0.4",
      "显隐重复Marker或透明度未保留"
    );
    passed.push("气象站列表、状态区域筛选、null详情、地图Popup定位显隐透明度");

    step = "24h预报图表";
    await router.push("/environment/forecast");
    await waitFor(
      () => rows(".forecast-page").length === 8 && document.querySelector(".forecast-charts canvas")
    );
    let chart;
    await waitFor(
      () => (chart = echarts.getInstanceByDom(document.querySelector(".forecast-charts > div")))
    );
    const options = chart.getOption();
    check(
      options.series.length === 3 && options.series[1].data.includes(null),
      "三条曲线或断点丢失"
    );
    check(
      Date.parse(forecast.selectedForecasts.at(-1).validAt) -
        Date.parse(forecast.selectedForecasts[0].forecastAt) ===
        24 * 3600000,
      "24h时间跨度"
    );
    await choose("预报地点", "MOCK 气象站 2");
    check(
      forecast.locationId === "weather-2" &&
        chart.getOption().series[0].data[0] === forecast.selectedForecasts[0].temperature,
      "曲线未随地点更新"
    );
    await router.push("/environment/fire-risk-factors");
    await nextTick();
    check(chart.isDisposed(), "停用后图表未销毁");
    passed.push("24h预报顺序、ECharts三曲线、null断点、选站更新与图表清理");

    step = "因子重新评估";
    await waitFor(() => rows(".factor-page").length === 8);
    const before = risk.riskZones[0].score;
    await choose("演示观测场景", "干热强风");
    check(risk.riskZones[0].score === before, "切场景自动评分");
    await button("重新评估");
    check(risk.riskZones[0].score > before && risk.riskZones[4].level === "extreme", "评分未更新");
    await button("因子详情", rows(".factor-page")[0]);
    await waitFor(() => document.querySelector(".factor-breakdown")?.textContent.includes("20%"));
    check(
      document.querySelectorAll(".factor-breakdown .el-table__body-wrapper tbody tr").length === 8,
      "八项因子未展示"
    );
    await close();
    await button("定位", rows(".factor-page")[0]);
    await waitFor(() => state()?.ready);
    check(
      pane("FireRiskLayer").textContent.includes("低湿度") &&
        pane("FireRiskLayer").textContent.includes("加权贡献"),
      "风险Popup缺乏解释"
    );
    check(
      document.querySelector(".risk-summary").textContent.includes(risk.maximumScore.toFixed(1)),
      "最高评分未同步"
    );
    check(
      document.querySelector(".risk-summary").textContent.includes(risk.averageScore.toFixed(1)),
      "平均评分未同步"
    );
    passed.push("场景变化、明确重评估、八因子与权重、风险Popup和Dashboard联动");

    step = "缺测和既有图层隔离";
    remote.toggle("product-2", true);
    await nextTick();
    await waitFor(() => pane("RemoteSensingLayer").querySelector("img")?.complete);
    const image = pane("RemoteSensingLayer").querySelector("img"),
      polygon = pane("FireRiskLayer").querySelector(".ff-risk-zone");
    const fireCount = document.querySelectorAll(".ff-fire-symbol").length,
      alertCount = document.querySelectorAll(".ff-alert-symbol").length;
    weather.updateObservation({ ...weather.observations[0], relativeHumidity: null });
    risk.reassess();
    await nextTick();
    check(
      risk.failedCount === 1 &&
        document.querySelector(".risk-summary").textContent.includes("1 处缺测"),
      "缺测状态"
    );
    check(
      pane("FireRiskLayer").querySelector(".ff-risk-zone") === polygon &&
        pane("RemoteSensingLayer").querySelector("img") === image,
      "评估重建现有空间对象"
    );
    state().drawing.select("point");
    const target = document.querySelector(".forest-map__canvas"),
      rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: rect.left + 80, clientY: rect.top + 80 })
    );
    await nextTick();
    state().drawing.clear();
    await nextTick();
    check(
      document.querySelectorAll(".ff-weather-symbol").length === 8 &&
        pane("RemoteSensingLayer").querySelector("img") === image &&
        document.querySelectorAll(".ff-uav-symbol").length === 8,
      "Drawing影响气象/遥感/UAV"
    );
    check(
      document.querySelectorAll(".ff-fire-symbol").length === fireCount &&
        document.querySelectorAll(".ff-alert-symbol").length === alertCount,
      "影响Fire/Alert"
    );
    passed.push("缺测保留上次风险、地图实例复用与Drawing/遥感/Fire/Alert/UAV隔离");

    step = "缓存恢复和reset";
    await router.push("/environment/forecast");
    await waitFor(() => document.querySelector(".forecast-charts canvas"));
    const restored = echarts.getInstanceByDom(document.querySelector(".forecast-charts > div"));
    check(restored && restored !== chart, "图表未恢复");
    await router.push("/dashboard");
    await waitFor(
      () =>
        state()?.ready &&
        pane("WeatherStationLayer")?.querySelectorAll(".ff-weather-symbol").length === 8
    );
    check(restored.isDisposed(), "返回Dashboard图表未释放");
    check(pane("WeatherStationLayer").style.opacity === "0.4", "气象图层偏好未恢复");
    weather.reset();
    forecast.reset();
    risk.reset();
    remote.reset();
    await nextTick();
    check(
      risk.failedCount === 0 && risk.highRiskCount === 4 && weather.locateRequest === null,
      "session reset遗留状态"
    );
    passed.push("KeepAlive重建无重复、图表释放、图层偏好与会话reset");
    return { passed };
  } catch (error) {
    return { passed, error: error.message };
  }
}
