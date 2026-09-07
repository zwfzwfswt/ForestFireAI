// 本地 Chromium：真实 Vue / Element Plus / Leaflet，不请求遥感服务。
export async function runRemoteSensingBrowserChecks({
  catalog,
  hot,
  risk,
  alerts,
  events,
  router,
  nextTick,
}) {
  const passed = [];
  let step = "初始化遥感";
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
          (b) => b.textContent.trim() === label && visible(b) && !b.disabled
        ))
    );
    check(target, `按钮 ${label}`);
    target.click();
    await nextTick();
  };
  const input = async (label, value) => {
    const el = [...document.querySelectorAll(`input[aria-label="${label}"]`)].find(visible);
    check(el, label);
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    await nextTick();
  };
  const choose = async (label, text) => {
    const target = [...document.querySelectorAll(`[aria-label="${label}"]`)].find(visible);
    check(target, label);
    target.closest(".el-select").querySelector(".el-select__wrapper").click();
    await nextTick();
    const option = [...document.querySelectorAll(".el-select-dropdown__item")].find(
      (e) => visible(e) && e.textContent.trim() === text
    );
    check(option, text);
    option.click();
    await nextTick();
  };
  const state = () => document.querySelector(".forest-map")?.__vueParentComponent.setupState;
  const pane = (id) => document.querySelector(`.leaflet-ff-business-${id}-pane`);
  const rows = (css) => [...document.querySelectorAll(`${css} .el-table__body-wrapper tbody tr`)];
  const close = async () => {
    document.querySelector(".remote-detail .el-drawer__close-btn").click();
    await nextTick();
  };
  try {
    catalog.reset();
    hot.reset();
    risk.reset();
    step = "Scene 页面";
    await router.push("/remote-sensing/data");
    await waitFor(() => rows(".scene-page").length === 8);
    await input("遥感搜索", "01");
    check(rows(".scene-page").length === 1, "搜索失效");
    await button("详情", rows(".scene-page")[0]);
    await waitFor(() => document.querySelector(".remote-detail img")?.complete);
    check(document.querySelector(".remote-detail").textContent.includes("EPSG:4326"), "CRS 未显示");
    check(document.querySelector(".remote-detail img").naturalWidth > 0, "本地缩略图未加载");
    await close();
    await button("重置筛选");
    await choose("卫星筛选", "Sentinel-2");
    check(rows(".scene-page").length === 2, "卫星筛选");
    await button("重置筛选");
    await input("最大云量", "0");
    check(rows(".scene-page").length === 1, "云量筛选");
    await button("地图定位", rows(".scene-page")[0]);
    await waitFor(() => state()?.ready);
    check(catalog.locateRequest === null, "覆盖范围定位未消费");
    passed.push("Scene 搜索、卫星云量筛选、详情缩略图、覆盖范围定位");

    step = "产品显示和图例";
    await router.push("/remote-sensing/products");
    await waitFor(() => rows(".product-page").length === 10);
    await choose("产品类型筛选", "NDVI");
    check(rows(".product-page").length === 2, "NDVI 筛选");
    await button("查看", rows(".product-page")[0]);
    check(document.querySelector(".remote-detail").textContent.includes("低 −1"), "详情图例");
    await close();
    await button("地图显示", rows(".product-page")[0]);
    await waitFor(
      () => state()?.ready && pane("RemoteSensingLayer")?.querySelector("img")?.complete
    );
    const image = pane("RemoteSensingLayer").querySelector("img");
    check(image.naturalWidth > 0, "NDVI Mock未加载");
    check(document.querySelector(".map-legend").textContent.includes("NDVI"), "NDVI 图例缺失");
    const slider = document.querySelector('.map-legend input[type="range"]');
    slider.value = ".3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    check(
      image === pane("RemoteSensingLayer").querySelector("img") && image.style.opacity === "0.3",
      "透明度重建影像或未更新"
    );
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    check(
      document.querySelector('.map-legend input[type="range"]') === slider,
      "零透明度后控制消失"
    );
    slider.value = ".3";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    state().business.setVisible("RemoteSensingLayer", false);
    await nextTick();
    check(!pane("RemoteSensingLayer").querySelector("img"), "整组隐藏失败");
    state().business.setVisible("RemoteSensingLayer", true);
    await nextTick();
    check(pane("RemoteSensingLayer").querySelector("img") === image, "整组显隐重建影像");
    catalog.toggle("product-2", false);
    catalog.locate("product", "product-7");
    await nextTick();
    await waitFor(() => pane("RemoteSensingLayer").querySelector("img")?.complete);
    check(
      document.querySelector(".map-legend").textContent.includes("低温 15°C") &&
        !document.querySelector(".map-legend").textContent.includes("NDVI 产品"),
      "LST 图例切换失效"
    );
    passed.push("产品筛选、ImageOverlay显隐、透明度复用、NDVI/LST图例切换");

    step = "卫星火点生成告警";
    await router.push("/remote-sensing/hotspots");
    await waitFor(() => rows(".hotspot-page").length === 10);
    await choose("火点置信度筛选", "未提供");
    check(rows(".hotspot-page").length === 4, "null 置信度筛选");
    await button("详情", rows(".hotspot-page")[0]);
    check(
      document.querySelector(".remote-detail").textContent.includes("FRP--"),
      "FRP null未显示--"
    );
    await close();
    const beforeEvents = events.events.length,
      beforeAlerts = alerts.alerts.length;
    await button("生成告警", rows(".hotspot-page")[0]);
    check(
      alerts.alerts.length === beforeAlerts + 1 && events.events.length === beforeEvents,
      "错误创建事件或未创建告警"
    );
    check(hot.hotspots[0].alertId && alerts.alerts.at(-1).confidence === null, "关联/空置信度丢失");
    check(
      [...rows(".hotspot-page")[0].querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "生成告警"
      ).disabled,
      "重复生成未禁用"
    );
    await button("定位", rows(".hotspot-page")[0]);
    await waitFor(
      () =>
        state()?.ready &&
        pane("SatelliteHotspotLayer")?.querySelectorAll(".ff-hotspot-symbol").length === 15
    );
    check(pane("SatelliteHotspotLayer").textContent.includes("FRP：--"), "Popup 空FRP不合理");
    state().business.setVisible("SatelliteHotspotLayer", false);
    await nextTick();
    check(!pane("SatelliteHotspotLayer").querySelector(".ff-hotspot-symbol"), "火点显隐失败");
    state().business.setVisible("SatelliteHotspotLayer", true);
    await nextTick();
    passed.push("Hotspot 空值、显隐、定位、明确生成Alert且不生成Event");

    step = "风险分区";
    await router.push("/remote-sensing/fire-risk");
    await waitFor(() => rows(".risk-page").length === 8);
    await button("详情", rows(".risk-page")[0]);
    check(
      document.querySelector(".remote-detail").textContent.includes("水分因素（Mock）"),
      "风险因子详情"
    );
    await close();
    await button("地图定位", rows(".risk-page")[0]);
    await waitFor(
      () => state()?.ready && pane("FireRiskLayer")?.querySelectorAll(".ff-risk-zone").length === 8
    );
    check(pane("FireRiskLayer").textContent.includes("水分："), "风险Popup");
    // 统计组件 class 由既有实现决定，使用 Dashboard 文本与源 Store 双重核对。
    check(
      risk.highRiskCount === 4 &&
        document
          .querySelector(".command-center")
          .textContent.includes("high / very_high / extreme"),
      "风险统计未接入"
    );
    catalog.toggle("product-8", true);
    await nextTick();
    await waitFor(() => pane("FireRiskLayer").querySelector("img")?.complete);
    check(
      pane("FireRiskLayer").querySelectorAll("img").length === 1 &&
        pane("FireRiskLayer").querySelectorAll(".ff-risk-zone").length === 8,
      "风险栅格/分区不在同组"
    );
    state().business.setOpacity("FireRiskLayer", 0.4);
    state().business.setVisible("FireRiskLayer", false);
    await nextTick();
    check(!pane("FireRiskLayer").querySelector("img"), "风险组隐藏");
    state().business.setVisible("FireRiskLayer", true);
    await nextTick();
    check(pane("FireRiskLayer").style.opacity === "0.4", "风险透明度");
    passed.push("风险等级详情、Popup、栅格分区同组、显隐透明度与Dashboard统计");

    step = "绘制和业务隔离";
    const fireCount = document.querySelectorAll(".ff-fire-symbol").length,
      alertCount = document.querySelectorAll(".ff-alert-symbol").length;
    state().drawing.select("point");
    const canvas = document.querySelector(".forest-map__canvas"),
      rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: rect.left + 70, clientY: rect.top + 70 })
    );
    await nextTick();
    state().drawing.clear();
    await nextTick();
    check(
      document.querySelectorAll(".ff-mock-raster").length === 2 &&
        document.querySelectorAll(".ff-hotspot-symbol").length === 15,
      "Drawing清除影响遥感"
    );
    check(
      document.querySelectorAll(".ff-fire-symbol").length === fireCount &&
        document.querySelectorAll(".ff-alert-symbol").length === alertCount &&
        document.querySelectorAll(".ff-uav-symbol").length === 8,
      "影响Fire/Alert/UAV"
    );
    passed.push("Drawing清除与遥感、风险、Alert、Fire、UAV隔离");

    step = "KeepAlive 恢复";
    await router.push("/remote-sensing/data");
    await nextTick();
    await router.push("/dashboard");
    await waitFor(
      () => state()?.ready && document.querySelectorAll(".ff-mock-raster").length === 2
    );
    check(
      document.querySelectorAll(".ff-hotspot-symbol").length === 15 &&
        document.querySelectorAll(".ff-risk-zone").length === 8,
      "重复注册Marker/Polygon"
    );
    check(pane("FireRiskLayer").style.opacity === "0.4", "图层偏好未恢复");
    catalog.reset();
    await nextTick();
    check(document.querySelectorAll(".ff-mock-raster").length === 0, "重置遗留栅格");
    passed.push("KeepAlive重建无重复、偏好恢复、Reset释放栅格");
    return { passed };
  } catch (error) {
    return { passed, error: error.message };
  }
}
