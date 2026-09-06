export async function runBackendBrowserChecks({
  store,
  telemetry,
  simulator,
  active,
  nextTick,
  router,
  maps,
}) {
  const passed = [];
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const sleep = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
  const waitFor = async (predicate) => {
    for (let i = 0; i < 600; i++) {
      if (predicate()) return;
      await sleep(25);
    }
    throw new Error("后端遥测/UI 状态等待超时");
  };
  const state = () => document.querySelector(".forest-map")?.__vueParentComponent.setupState;
  const markers = () =>
    Object.values(maps.at(-1)._layers).filter(
      (layer) => layer.options?.pane === "ff-business-UAVLayer" && layer.getLatLng
    );
  const tracks = () =>
    Object.values(maps.at(-1)._layers).filter(
      (layer) => layer.options?.pane === "ff-business-UAVTrackLayer" && layer.getLatLngs
    );
  const switchSource = async (value) => {
    const select = document.querySelector('[aria-label="遥测数据来源"]');
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
  };
  const manageBackend = async (command) => {
    const response = await fetch(`/__backend_${command}__`, { method: "POST" });
    check(response.ok, `后端 ${command} 失败`);
  };
  await waitFor(() => state()?.ready && Object.keys(telemetry.latestTelemetryByUavId).length === 5);
  check(
    simulator.source === "websocket" && simulator.connection.status === "connected",
    "环境变量未选择 WebSocket"
  );
  check(
    document.querySelector(".uav-simulator").textContent.includes("BACKEND WEBSOCKET"),
    "数据来源标识缺失"
  );
  check(!simulator.state.timerActive, "WebSocket 模式仍在运行本地模拟器");
  const id = store.list[0].id,
    original = markers(),
    position = original[0].getLatLng();
  await sleep(1200);
  await nextTick();
  check(
    markers().every((marker, index) => marker === original[index]),
    "WebSocket 重建了 Marker"
  );
  check(original[0].getLatLng().lng !== position.lng, "后端遥测未移动 Marker");
  check(tracks().length === 5 && telemetry.tracksByUavId[id].length >= 2, "后端轨迹未增长");
  original[0].fire("click");
  original[0].openPopup();
  await nextTick();
  const popup = original[0].getPopup().getContent();
  await sleep(1100);
  check(original[0].getPopup().getContent() !== popup, "打开的 Popup 未实时更新");
  document.querySelector(".uav-map-selection button").click();
  await waitFor(() => document.querySelector(".el-drawer"));
  const detail = document.querySelector(".el-drawer").textContent;
  await sleep(1100);
  await nextTick();
  check(document.querySelector(".el-drawer").textContent !== detail, "后端详情未刷新");
  document.querySelector(".el-drawer__close-btn").click();
  passed.push("Python → WebSocket → Store → Marker/Popup/详情/轨迹");
  state().business.setOpacity("UAVLayer", 0.4);
  state().business.setVisible("UAVTrackLayer", false);
  await nextTick();
  check(tracks().length === 0, "轨迹不能单独隐藏");
  state().business.setVisible("UAVTrackLayer", true);
  state().drawing.clear();
  check(tracks().length === 5, "清除绘制影响轨迹");
  check(document.querySelectorAll(".ff-business-symbol").length === 4, "业务火点/资源丢失");
  await router.push("/uav/list");
  await nextTick();
  await waitFor(() => document.querySelector(".uav-page"));
  check(document.querySelector(".el-table").textContent.includes("林区巡护机"), "UAV 列表未保留");
  await waitFor(() => simulator.connection.status === "connected");
  passed.push("原有 UI、UAV/轨迹显隐透明度、Drawing/业务层隔离");
  await manageBackend("stop");
  await waitFor(() => simulator.connection.status === "reconnecting");
  await sleep(6200);
  await nextTick();
  check(store.selectedUav.status === "offline", "断线后五秒离线判定未生效");
  await manageBackend("start");
  await waitFor(
    () => simulator.connection.status === "connected" && store.selectedUav.status === "online"
  );
  passed.push("真实后端退出、自动退避重连、离线与恢复在线");
  active.value = false;
  await nextTick();
  check(simulator.connection.status === "disconnected", "停用未断开连接");
  await manageBackend("stop");
  await sleep(1200);
  check(simulator.connection.status === "disconnected", "停用后仍在重连");
  await manageBackend("start");
  active.value = true;
  await nextTick();
  await waitFor(() => simulator.connection.status === "connected");
  await switchSource("local");
  check(Object.keys(telemetry.latestTelemetryByUavId).length === 0, "切换来源未清理旧遥测");
  [...document.querySelectorAll(".uav-simulator button")]
    .find((button) => button.textContent.includes("启动全部"))
    .click();
  await nextTick();
  check(simulator.state.timerActive && simulator.source === "local", "本地来源不能恢复运行");
  await switchSource("websocket");
  await waitFor(() => Object.keys(telemetry.latestTelemetryByUavId).length === 5);
  check(!simulator.state.timerActive, "切换后本地 timer 未停止");
  passed.push("页面停用/激活、重连取消与 local/websocket 互斥切换");
  await router.push("/dashboard");
  await nextTick();
  await waitFor(() => state()?.ready);
  const stable = markers();
  store.remove(id);
  await nextTick();
  await sleep(1100);
  check(
    markers().length === 7 && !telemetry.getLatestTelemetry(id) && !telemetry.tracksByUavId[id],
    "后端消息复活了已删除资产"
  );
  simulator.reset();
  check(
    simulator.connection.status === "disconnected" && tracks().length === 0,
    "重置未断开和清理"
  );
  check(
    markers().every((marker) => stable.includes(marker)),
    "重置重建了资产 Marker"
  );
  active.value = false;
  await nextTick();
  passed.push("删除拒绝迟到遥测、重置与卸载清理");
  return { passed };
}
