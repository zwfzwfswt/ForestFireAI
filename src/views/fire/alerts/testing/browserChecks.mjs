// 复用 GIS harness，操作真实 Dashboard、告警中心、Drawer 与 Leaflet。
export async function runAlertBrowserChecks({ store, events, router, nextTick }) {
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
    throw new Error("等待告警界面超时");
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
  const choose = async (label, text) => {
    const target = [...document.querySelectorAll(`[aria-label="${label}"]`)].find(visible);
    target.closest(".el-select").querySelector(".el-select__wrapper").click();
    await nextTick();
    let option;
    await waitFor(
      () =>
        (option = [...document.querySelectorAll(".el-select-dropdown__item")].find(
          (item) => visible(item) && item.textContent.trim() === text
        ))
    );
    option.click();
    await nextTick();
  };
  const rows = () => [
    ...document.querySelectorAll(".alerts-page .el-table__body-wrapper tbody tr"),
  ];
  const drawer = () => [...document.querySelectorAll(".alert-detail")].find(visible);
  const close = async () => {
    drawer().querySelector(".el-drawer__close-btn").click();
    await nextTick();
  };
  const mapState = () => document.querySelector(".forest-map")?.__vueParentComponent.setupState;
  const markers = () => [
    ...document.querySelectorAll(".leaflet-ff-business-FireAlertLayer-pane .ff-alert-symbol"),
  ];
  try {
    store.reset();
    await router.push("/dashboard");
    await waitFor(() => mapState()?.ready && markers().length === 16);
    const cards = [...document.querySelectorAll(".dashboard-alerts .alert-card")];
    check(
      cards.length === 5 &&
        cards.every((card) =>
          store.dashboardAlerts.some((alert) => alert.id === card.dataset.alertId)
        ),
      "Dashboard 不是待处理 Store 视图"
    );
    const first = cards[0].dataset.alertId;
    await button("查看告警 / 研判", cards[0]);
    await waitFor(drawer);
    check(store.selectedId === first, "Dashboard 未打开对应详情");
    await button("确认告警", drawer());
    check(
      events.events.length === 10 && !store.selectedAlert.fireEventId,
      "确认告警自动创建了事件"
    );
    check(
      !document.querySelector(`.dashboard-alerts [data-alert-id="${first}"]`),
      "确认后仍留在待处理面板"
    );
    await close();
    passed.push("Dashboard 单一待处理视图、详情入口、确认不自动创建事件");

    await router.push("/fire/alerts");
    await nextTick();
    await waitFor(() => rows().length === 10);
    await input("搜索告警", store.alerts[0].code.toLowerCase());
    check(rows().length === 1, "编号搜索失败");
    await button("重置告警筛选");
    await choose("告警类型筛选", "人工报告");
    check(
      rows().length === store.alerts.filter((a) => a.type === "manual_report").length,
      "类型筛选失败"
    );
    await button("重置告警筛选");
    await choose("告警来源筛选", "人工上报");
    check(rows().length === 2, "来源筛选失败");
    check(
      rows().every((row) => row.textContent.includes("--")),
      "人工置信度缺失未显示 --"
    );
    await button("重置告警筛选");
    await choose("告警状态筛选", "新告警");
    await choose("告警等级筛选", "低");
    check(rows().length === 2, "状态等级组合筛选失败");
    await button("重置告警筛选");
    passed.push("告警真实列表、搜索、类型来源状态等级筛选和空置信度");

    await input("搜索告警", store.alerts[0].code);
    await button("研判详情", rows()[0]);
    await waitFor(drawer);
    const image = drawer().querySelector("img");
    await waitFor(() => image?.complete && image.naturalWidth > 0);
    check(drawer().textContent.includes("示意图"), "图片未标记 Mock");
    await button("开始研判", drawer());
    await input("告警研判意见", "浏览器人工核实");
    await button("确认告警", drawer());
    check(events.events.length === 10, "确认阶段意外创建事件");
    await button("创建火情事件", drawer());
    const event = events.events.at(-1);
    check(events.events.length === 11 && event.status === "confirmed", "未创建已确认事件");
    check(
      event.alertIds.includes(store.selectedId) && store.selectedAlert.fireEventId === event.id,
      "创建没有双向关联"
    );
    check(
      event.title === store.selectedAlert.title &&
        event.location.longitude === store.selectedAlert.location.longitude,
      "未带入告警信息"
    );
    check(
      ![...drawer().querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "创建火情事件"
      ),
      "已关联仍显示创建按钮"
    );
    await close();
    // 重新打开关联告警，验证跳转到现有 Fire Event 详情，不另建详情逻辑。
    await button("研判详情", rows()[0]);
    await waitFor(drawer);
    await button(`${event.code} · 查看火情`, drawer());
    await waitFor(
      () =>
        router.currentRoute.value.path === "/fire/events" && document.querySelector(".fire-detail")
    );
    check(events.selectedEvent?.id === event.id, "关联火情详情跳转目标错误");
    document.querySelector(".fire-detail .el-drawer__close-btn").click();
    await nextTick();
    await router.push("/fire/alerts");
    await nextTick();
    await waitFor(() => rows().length === 1);
    passed.push("人工研判、Mock 图片、显式创建 Event 与双向关联防重");

    await input("搜索告警", store.alerts[1].code);
    await button("研判详情", rows()[0]);
    await waitFor(drawer);
    await button("开始研判", drawer());
    await button("确认告警", drawer());
    await choose("关联火情选择", `${event.code} · ${event.title} · 已确认`);
    await button("关联已有火情", drawer());
    check(
      events.events.length === 11 && events.events.at(-1).alertIds.length === 2,
      "未汇总至同一事件"
    );
    await close();
    await input("搜索告警", store.alerts[2].code);
    await button("研判详情", rows()[0]);
    await waitFor(drawer);
    await button("开始研判", drawer());
    await choose("重复火情选择", `${event.code} · ${event.title}`);
    await button("标记重复", drawer());
    check(drawer().textContent.includes("必须填写理由"), "重复未校验理由");
    await input("告警研判意见", "同一火点多源重复");
    await button("标记重复", drawer());
    check(
      store.selectedAlert.status === "duplicate" &&
        store.selectedAlert.duplicateOfFireEventId === event.id,
      "重复归属错误"
    );
    await close();
    await input("搜索告警", store.alerts[3].code);
    await button("研判详情", rows()[0]);
    await waitFor(drawer);
    await button("开始研判", drawer());
    await input("告警研判意见", "云雾干扰");
    await button("驳回告警", drawer());
    check(store.selectedAlert.status === "rejected", "驳回失败");
    await close();
    passed.push("关联已有事件、多源归一、重复理由与驳回");

    await input("搜索告警", store.alerts[0].code);
    await button("定位", rows()[0]);
    await waitFor(() => mapState()?.ready && markers().length === 16);
    check(mapState().zoom === 13 && !store.locateRequest, "定位请求未消费");
    const marker = markers().find((m) => m.title.includes(store.alerts[0].code));
    check(marker, "缺少告警 Marker");
    check(
      document.querySelector(".leaflet-popup")?.textContent.includes(event.code),
      "Popup 未显示关联火情编号"
    );
    await button("查看告警", document.querySelector(".leaflet-popup"));
    await waitFor(drawer);
    check(store.selectedAlert.id === store.alerts[0].id, "Popup 详情错误");
    await close();
    await button("绘制点");
    marker.click();
    await nextTick();
    check(mapState().count === 1, "告警抢占点绘制");
    await button("清除临时绘制");
    check(
      markers().length === 16 && document.querySelectorAll(".ff-fire-symbol").length === 11,
      "Drawing 清除破坏业务层"
    );
    const panel = document.querySelector(".business-panel");
    panel.open = true;
    panel.querySelector('[data-layer-id="FireAlertLayer"]').closest("details").open = true;
    const checkbox = panel.querySelector('[data-layer-id="FireAlertLayer"] input[type="checkbox"]');
    checkbox.click();
    await nextTick();
    check(markers().length === 0, "告警隐藏失败");
    checkbox.click();
    await nextTick();
    check(markers().length === 16, "告警显示失败");
    const slider = panel.querySelector('[data-layer-id="FireAlertLayer"] input[type="range"]');
    slider.value = "0.4";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    check(
      document.querySelector(".leaflet-ff-business-FireAlertLayer-pane").style.opacity === "0.4",
      "告警透明度失败"
    );
    check(
      document.querySelectorAll(".ff-uav-symbol").length === 8 &&
        document.querySelector(".leaflet-ff-business-HighRiskLayer-pane path"),
      "UAV/风险图层受影响"
    );
    await router.push("/fire/alerts");
    await nextTick();
    await waitFor(() => rows().length === 1);
    check(store.alerts[0].fireEventId === event.id, "切页关联丢失");
    events.reset();
    await nextTick();
    check(
      store.alerts.length === 16 &&
        !store.selectedId &&
        !store.detailOpen &&
        store.alerts.filter((a) => a.fireEventId).length === 3,
      "会话重置失败"
    );
    await router.push("/dashboard");
    await waitFor(() => mapState()?.ready && markers().length === 16);
    check(document.querySelectorAll(".ff-fire-symbol").length === 10, "重置后火情未恢复");
    passed.push("AlertLayer 显隐透明度、Popup、定位、Drawing 隔离及切页重置");
    return { passed };
  } catch (error) {
    return { passed, error: `${step}：${error.message}` };
  }
}
