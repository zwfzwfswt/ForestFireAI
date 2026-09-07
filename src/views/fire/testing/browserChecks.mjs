// 通过现有 GIS Chromium harness 运行：真实 SFC/Pinia/Router/Leaflet，无后端或外部瓦片。
export async function runFireBrowserChecks({ store, router, nextTick }) {
  const passed = [];
  let step = "初始化";
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("等待火情界面超时");
  };
  const visible = (element) =>
    element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== "hidden";
  const button = async (text, scope = document) => {
    step = `点击 ${text}`;
    let target;
    await waitFor(
      () =>
        (target = [...scope.querySelectorAll("button")].find(
          (item) => item.textContent.trim() === text && visible(item) && !item.disabled
        ))
    );
    target.click();
    await nextTick();
  };
  const input = async (label, value) => {
    const target = [
      ...document.querySelectorAll(`input[aria-label="${label}"],textarea[aria-label="${label}"]`),
    ].find(visible);
    check(target, `缺少输入框 ${label}`);
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.blur();
    await nextTick();
  };
  const choose = async (label, value) => {
    const target = [...document.querySelectorAll(`[aria-label="${label}"]`)].find(visible);
    target.closest(".el-select").querySelector(".el-select__wrapper").click();
    await nextTick();
    const option = [...document.querySelectorAll(".el-select-dropdown__item")].find(
      (item) => visible(item) && item.textContent.trim() === value
    );
    check(option, `缺少选项 ${value}`);
    option.click();
    await nextTick();
  };
  const rows = () => [...document.querySelectorAll(".fire-page .el-table__body-wrapper tbody tr")];
  const row = (text) => rows().find((item) => item.textContent.includes(text));
  const state = () => document.querySelector(".forest-map")?.__vueParentComponent.setupState;
  const markers = () => [
    ...document.querySelectorAll(".leaflet-ff-business-FireEventLayer-pane .ff-fire-symbol"),
  ];
  const drawer = () => [...document.querySelectorAll(".fire-detail")].find(visible);
  const closeDetail = async () => {
    drawer().querySelector(".el-drawer__close-btn").click();
    await nextTick();
  };
  try {
    await router.push("/fire/events");
    await nextTick();
    await waitFor(() => rows().length === 10);
    await input("搜索火情", store.events[0].code);
    check(rows().length === 1, "编号搜索失败");
    await button("重置筛选");
    await choose("火情状态筛选", "疑似火情");
    check(rows().length === 2, "状态筛选失败");
    await choose("火情等级筛选", "低");
    check(rows().length === 2, "等级筛选失败");
    await choose("火情来源筛选", "人工上报");
    check(rows().length === 1, "来源组合筛选失败");
    await button("重置筛选");
    passed.push("火情真实列表、搜索、状态等级来源组合筛选");

    await button("新建火情");
    await button("保存 Mock 火情");
    check(document.body.textContent.includes("标题必填"), "未阻止空表单");
    await input("火情标题", "浏览器新建火情");
    await button("地图选点");
    step = "等待选点地图";
    await waitFor(() => document.querySelector(".fire-location-map.leaflet-container"));
    await button("选择位置");
    const canvas = document.querySelector(".fire-location-map");
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        detail: 1,
        button: 0,
      })
    );
    await nextTick();
    await waitFor(() => !document.querySelector(".fire-location-map"));
    const longitude = Number(document.querySelector('input[aria-label="火情经度"]').value);
    check(Number.isFinite(longitude) && Math.abs(longitude - 119.7) < 0.05, "地图点未填入经度");
    await button("保存 Mock 火情");
    await waitFor(() => store.events.length === 11);
    const created = store.events.at(-1);
    check(created.status === "suspected", "初始状态错误");
    await input("搜索火情", "浏览器新建火情");
    await waitFor(() => rows().length === 1);
    await button("编辑", rows()[0]);
    await input("火情标题", "浏览器编辑火情");
    await button("保存 Mock 火情");
    await input("搜索火情", "浏览器编辑火情");
    await waitFor(() => row("浏览器编辑火情"));
    check(store.events.at(-1).code === created.code, "编辑改变编号");
    passed.push("新建必填校验、GIS 点选填表、编号保留和编辑");

    await button("详情", rows()[0]);
    await waitFor(drawer);
    await input("状态变更备注", "浏览器核实记录");
    await button("转为核实中", drawer());
    check(
      store.selectedEvent.status === "verifying" && drawer().textContent.includes("浏览器核实记录"),
      "状态/时间线未更新"
    );
    for (const label of ["已确认", "处置中", "已控制", "已扑灭", "已关闭"])
      await button(`转为${label}`, drawer());
    check(
      store.selectedEvent.timeline.length === 6 && store.selectedEvent.closedAt,
      "状态链时间线不完整"
    );
    check(
      ![...drawer().querySelectorAll("button")].some((item) => item.textContent.includes("转为")),
      "终态仍可跳转"
    );
    await input("处置记录内容", "浏览器处置记录");
    await button("新增 Mock 处置记录", drawer());
    check(
      store.selectedEvent.actions.length === 1 && drawer().textContent.includes("浏览器处置记录"),
      "记录未追加"
    );
    await closeDetail();
    passed.push("详情状态链、终态限制、Timeline 与人工处置记录");

    await button("定位", rows()[0]);
    await waitFor(() => state()?.ready && markers().length === 11);
    check(
      router.currentRoute.value.path === "/dashboard" &&
        state().zoom === 13 &&
        !store.locateRequest,
      "列表定位未消费"
    );
    const marker = markers().find((item) => item.title.includes("浏览器编辑火情"));
    check(marker && marker.textContent.includes("结"), "closed 标记没有保留/区别样式");
    marker.click();
    await nextTick();
    check(store.selectedId === created.id, "Marker 未同步选中");
    // 定位已打开 Popup；再次点击 Marker 会按 Leaflet 默认行为收起。
    if (!document.querySelector(".leaflet-popup")) {
      marker.click();
      await nextTick();
    }
    await button("查看详情", document.querySelector(".leaflet-popup"));
    await waitFor(drawer);
    check(drawer().textContent.includes(created.code), "Popup 详情目标错误");
    await closeDetail();
    await button("绘制点");
    marker.click();
    await nextTick();
    check(state().count === 1, "火情 Marker 抢占点绘制");
    await button("清除临时绘制");
    check(markers().length === 11, "Drawing 清除误删火情");
    const panel = document.querySelector(".business-panel");
    panel.open = true;
    panel.querySelector('[data-layer-id="FireEventLayer"]').closest("details").open = true;
    const checkbox = panel.querySelector('[data-layer-id="FireEventLayer"] input[type="checkbox"]');
    checkbox.click();
    await nextTick();
    check(markers().length === 0, "火情隐藏失败");
    checkbox.click();
    await nextTick();
    check(markers().length === 11, "火情显示失败");
    check(
      document.querySelectorAll(".ff-uav-symbol").length === 8 &&
        document.querySelector(".leaflet-ff-business-HighRiskLayer-pane path"),
      "破坏 UAV 或风险图层"
    );
    passed.push("closed Marker、列表定位、Popup 详情、绘制透传与业务层隔离");

    await router.push("/fire/events");
    await nextTick();
    await waitFor(() => row("浏览器编辑火情"));
    await button("详情", rows()[0]);
    await waitFor(drawer);
    check(store.selectedEvent.timeline.length === 6, "切页丢失时间线");
    await router.push("/dashboard");
    await waitFor(() => state()?.ready);
    await waitFor(() => !drawer());
    check(markers().length === 11, "切页火情数量错误");
    store.reset();
    await nextTick();
    check(
      markers().length === 10 && !store.selectedEvent && !store.detailOpen,
      "会话重置未清理火情"
    );
    passed.push("页面缓存恢复、详情关闭与会话重置");
    return { passed };
  } catch (error) {
    return { passed, error: `${step}：${error.message}` };
  }
}
