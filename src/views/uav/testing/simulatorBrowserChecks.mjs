export async function runSimulatorBrowserChecks({
  store,
  telemetry,
  simulator,
  active,
  nextTick,
  router,
  maps,
  duration,
}) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate) => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await sleep(25);
    }
    throw new Error("等待地图或 UI 超时");
  };
  const state = () => document.querySelector(".forest-map").__vueParentComponent.setupState;
  const markers = () =>
    Object.values(maps.at(-1)._layers).filter(
      (layer) => layer.options?.pane === "ff-business-UAVLayer" && layer.getLatLng
    );
  const trackLayers = () =>
    Object.values(maps.at(-1)._layers).filter(
      (layer) => layer.options?.pane === "ff-business-UAVTrackLayer" && layer.getLatLngs
    );
  const click = async (text) => {
    const button = [...document.querySelectorAll(".uav-simulator button")].find(
      (item) => item.textContent.trim() === text
    );
    check(button && !button.disabled, `控制按钮不可用: ${text}`);
    button.click();
    await nextTick();
  };
  await waitFor(() => document.querySelector(".forest-map") && state().ready);
  const passed = [];
  const id = store.list[0].id;
  const initial = markers();
  await click("启动全部模拟器");
  check(
    simulator.state.timerActive && Object.keys(telemetry.latestTelemetryByUavId).length === 5,
    "未启动五架模拟器"
  );
  await sleep(1150);
  await nextTick();
  check(
    markers().every((marker, i) => marker === initial[i]),
    "遥测重建了 Marker"
  );
  check(initial[0].getLatLng().lng !== store.list[0].position.longitude, "Marker 未移动");
  initial[0].fire("click");
  initial[0].openPopup();
  await nextTick();
  check(
    document.querySelector(".leaflet-popup-content")?.textContent.includes("SIMULATOR"),
    "Popup 未读取遥测"
  );
  const detailButton = [...document.querySelectorAll(".uav-map-selection button")].find((button) =>
    button.textContent.includes("详情")
  );
  check(detailButton, "地图详情入口缺失");
  detailButton.click();
  await waitFor(() => document.querySelector(".el-drawer"));
  const detailBefore = document.querySelector(".el-drawer").textContent;
  await sleep(1100);
  await nextTick();
  check(document.querySelector(".el-drawer").textContent !== detailBefore, "详情未实时刷新");
  document.querySelector(".el-drawer__close-btn").click();
  await nextTick();
  passed.push("启动五机、Marker 复用/移动、Popup 与详情实时更新");
  const previous = telemetry.getLatestTelemetry(id);
  await click("暂停");
  await sleep(6100);
  await nextTick();
  check(
    telemetry.getLatestTelemetry(id) === previous && store.selectedUav.status === "offline",
    "暂停/离线规则失效"
  );
  await click("恢复");
  await nextTick();
  check(store.selectedUav.status === "online", "恢复后未上线");
  await click("暂停全部");
  await sleep(1100);
  const paused = telemetry.getLatestTelemetry(id);
  await sleep(1100);
  check(telemetry.getLatestTelemetry(id) === paused, "全部暂停仍产生遥测");
  await click("恢复全部");
  passed.push("单机暂停、超过五秒离线、恢复在线、全部暂停/恢复");
  state().business.setVisible("UAVTrackLayer", false);
  await nextTick();
  check(trackLayers().length === 0, "轨迹隐藏失败");
  state().business.setVisible("UAVTrackLayer", true);
  state().business.setOpacity("UAVLayer", 0.4);
  const count = trackLayers().length;
  state().drawing.clear();
  await nextTick();
  check(count === 5 && trackLayers().length === 5, "清除绘制破坏轨迹");
  check(
    document.querySelector(".leaflet-ff-business-UAVLayer-pane").style.opacity === "0.4",
    "UAV 透明度失效"
  );
  await router.push("/uav/list");
  await nextTick();
  check(simulator.state.timerActive, "资产页面未接管调度器");
  active.value = false;
  await nextTick();
  check(!simulator.state.timerActive, "停用未停止调度器");
  active.value = true;
  await nextTick();
  check(simulator.state.timerActive, "激活未恢复调度器");
  await router.push("/dashboard");
  await nextTick();
  await waitFor(() => state().ready);
  check(markers().length === 8 && trackLayers().length === 5, "重建未恢复 UAV/轨迹");
  passed.push("图层隔离、显隐/透明度、跨页面状态及计时生命周期");

  // Real wall clock, no virtual-time acceleration. Leaflet objects observed only in tests.
  const stableMarkers = markers();
  const listenerCount = (marker) =>
    Object.values(marker._events ?? {}).reduce((n, entries) => n + entries.length, 0);
  const listenerCounts = stableMarkers.map(listenerCount);
  const beginning = performance.now();
  const samples = [];
  let previousTimestamp = telemetry.getLatestTelemetry(id).timestamp;
  let updates = 0;
  while (performance.now() - beginning < duration) {
    await sleep(1000);
    const started = performance.now();
    await nextTick();
    check(
      markers().every((marker, i) => marker === stableMarkers[i]),
      "持续运行重建 Marker"
    );
    check(
      stableMarkers.every((marker, i) => listenerCount(marker) === listenerCounts[i]),
      "监听器数量增长"
    );
    check(
      Object.keys(telemetry.latestTelemetryByUavId).length === 5 &&
        Object.values(telemetry.tracksByUavId).every((points) => points.length <= 300),
      "遥测/轨迹无限增长"
    );
    const timestamp = telemetry.getLatestTelemetry(id).timestamp;
    if (timestamp !== previousTimestamp) updates++;
    previousTimestamp = timestamp;
    samples.push(performance.now() - started);
  }
  const elapsed = performance.now() - beginning;
  if (duration >= 600000) {
    check(updates >= 590, "1Hz 持续更新次数不足");
    check(
      Object.values(telemetry.tracksByUavId).every((points) => points.length === 300),
      "轨迹未达到/保持上限"
    );
  }
  const performanceResult = {
    elapsedMs: Math.round(elapsed),
    observedTicks: updates,
    uavs: 5,
    maxTrackPoints: Math.max(
      ...Object.values(telemetry.tracksByUavId).map((points) => points.length)
    ),
    markersRecreated: 0,
    listenersAdded: 0,
    maxInspectionMs: Math.max(...samples),
  };
  passed.push("持续运行 Marker/监听器稳定、数据有界");
  const beforeDelete = markers().length;
  store.remove(id);
  await nextTick();
  check(
    markers().length === beforeDelete - 1 && !telemetry.tracksByUavId[id] && !store.selectedUav,
    "删除未清理 Marker/轨迹/选中项"
  );
  await click("重置模拟遥测");
  check(
    !simulator.state.timerActive &&
      Object.keys(telemetry.latestTelemetryByUavId).length === 0 &&
      trackLayers().length === 0 &&
      store.list.length === 7,
    "重置未清理或破坏资产"
  );
  active.value = false;
  await nextTick();
  check(
    !simulator.state.timerActive && stableMarkers.every((marker) => listenerCount(marker) === 0),
    "卸载后 timer/监听器残留"
  );
  passed.push("删除同步、重置保留资产、卸载清理");
  return { passed, performance: performanceResult };
}
