// 由现有 GIS Chromium harness 执行，使用真实 Vue、Pinia、Router、Element Plus、Leaflet。
export async function runUavBrowserChecks({ store, router, nextTick }) {
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
    throw new Error("等待 UAV 界面超时");
  };
  const visible = (element) =>
    element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== "hidden";
  const button = async (text, scope = document) => {
    step = `点击 ${text}`;
    let target;
    await waitFor(() => {
      target = [...scope.querySelectorAll("button")].find(
        (item) => item.textContent.trim() === text && visible(item) && !item.disabled
      );
      return target;
    });
    target.click();
    await nextTick();
  };
  const input = async (label, value) => {
    const target = [...document.querySelectorAll(`input[aria-label="${label}"]`)].find(visible);
    check(target, `找不到输入框：${label}`);
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.blur();
    await nextTick();
  };
  const rows = () => [...document.querySelectorAll(".uav-page .el-table__body-wrapper tbody tr")];
  const row = (text) => rows().find((item) => item.textContent.includes(text));
  const mapState = () => document.querySelector(".forest-map")?.__vueParentComponent.setupState;
  const uavPane = () => document.querySelector(".leaflet-ff-business-UAVLayer-pane");
  const markers = () => [...(uavPane()?.querySelectorAll(".ff-uav-symbol") ?? [])];
  try {
    document.querySelector("#app").style.width = "1200px";
    check(markers().length === 8, "默认未显示八个 UAV Marker");
    const marker = markers()[0];
    check(marker.closest(".leaflet-ff-business-UAVLayer-pane"), "UAV 未使用业务 pane");
    marker.click();
    await nextTick();
    check(
      store.selectedUav && document.querySelector(".leaflet-popup")?.textContent.includes("电量"),
      "Marker 点击未显示 Popup/选中"
    );
    check(
      document.querySelector(".uav-map-selection")?.textContent.includes(store.selectedUav.name),
      "选中信息未同步"
    );
    await button("查看无人机详情");
    await waitFor(() => [...document.querySelectorAll(".el-drawer")].some(visible));
    check(
      document.querySelector(".el-drawer__body").textContent.includes("载荷信息 / 设备能力"),
      "详情缺失能力"
    );
    document.querySelector(".el-drawer__close-btn").click();
    await nextTick();
    const panel = document.querySelector(".business-panel");
    panel.open = true;
    const category = panel.querySelector('[data-layer-id="UAVLayer"]').closest("details");
    category.open = true;
    const checkbox = panel.querySelector('[data-layer-id="UAVLayer"] input[type="checkbox"]');
    checkbox.click();
    await nextTick();
    check(markers().length === 0, "UAV 隐藏失败");
    checkbox.click();
    await nextTick();
    check(markers().length === 8, "UAV 显示失败");
    const slider = panel.querySelector('[data-layer-id="UAVLayer"] input[type="range"]');
    slider.value = "0.4";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    check(uavPane().style.opacity === "0.4", "UAV 透明度未生效");
    panel.open = false;
    passed.push("UAV Marker、Popup、详情与图层面板");

    await router.push("/uav/list");
    await nextTick();
    await waitFor(() => rows().length === 8);
    await input("搜索无人机", "mock-ff-0001");
    check(rows().length === 1, "搜索未筛选");
    await button("重置筛选");
    check(rows().length === 8, "重置未恢复列表");
    const choose = async (label, option) => {
      document
        .querySelector(`[aria-label="${label}"]`)
        .closest(".el-select")
        .querySelector(".el-select__wrapper")
        .click();
      await nextTick();
      const target = [...document.querySelectorAll(".el-select-dropdown__item")].find(
        (item) => item.textContent.trim() === option && visible(item)
      );
      check(target, `选项不存在：${option}`);
      target.click();
      await nextTick();
    };
    await choose("状态筛选", "执行任务");
    check(rows().length === 2, "状态筛选错误");
    await choose("型号筛选", "热成像四旋翼 B");
    check(rows().length === 1, "型号组合筛选错误");
    await button("重置筛选");
    passed.push("UAV 列表、搜索、状态与型号组合筛选");

    await button("新增无人机");
    await waitFor(() => [...document.querySelectorAll(".el-dialog")].some(visible));
    await button("保存 Mock 资产");
    await waitFor(() => document.querySelectorAll(".el-form-item__error").length >= 4);
    check(document.querySelectorAll(".el-form-item__error").length >= 4, "未校验必填字段");
    await input("无人机名称", "浏览器测试机");
    await input("无人机 SN", " mock-ff-0001 ");
    await input("无人机型号", "测试型号");
    await input("经度", "181");
    await input("纬度", "91");
    await button("保存 Mock 资产");
    await waitFor(() => document.body.textContent.includes("SN 已存在"));
    check(
      document.body.textContent.includes("SN 已存在") &&
        document.body.textContent.includes("-180 至 180") &&
        document.body.textContent.includes("-90 至 90"),
      "重复 SN/坐标未校验"
    );
    check(store.list.length === 8, "无效表单已保存");
    await input("无人机 SN", "BROWSER-NEW");
    await input("经度", "119.72");
    await input("纬度", "30.26");
    await button("保存 Mock 资产");
    await waitFor(() => rows().length === 9);
    check(row("浏览器测试机").textContent.includes("暂无快照"), "新增遥测未标记空值");
    const addedId = store.list.find((item) => item.serialNumber === "BROWSER-NEW").id;
    passed.push("真实表单必填、重复 SN、坐标校验与新增");

    await button("编辑", row("浏览器测试机"));
    await nextTick();
    await input("无人机名称", "取消修改");
    await button("取消", [...document.querySelectorAll(".el-dialog")].find(visible));
    check(
      store.list.find((item) => item.id === addedId).name === "浏览器测试机",
      "取消编辑污染数据"
    );
    await button("编辑", row("浏览器测试机"));
    await input("无人机名称", "编辑后的测试机");
    await button("保存 Mock 资产");
    await waitFor(() => row("编辑后的测试机"));
    await button("详情", row("编辑后的测试机"));
    await waitFor(() => [...document.querySelectorAll(".el-drawer")].some(visible));
    check(
      [...document.querySelectorAll(".el-drawer__body")].some(
        (item) => visible(item) && item.textContent.includes("编辑后的测试机")
      ),
      "编辑后详情未同步"
    );
    [...document.querySelectorAll(".el-drawer__close-btn")].find(visible).click();
    await nextTick();
    passed.push("编辑、取消与详情同步");

    await button("定位", row("编辑后的测试机"));
    await waitFor(() => mapState()?.ready && markers().length === 9);
    check(
      router.currentRoute.value.path === "/dashboard" && store.selectedId === addedId,
      "定位未跳转 Dashboard"
    );
    check(mapState().zoom === 13 && !store.locateRequest, "定位未应用或未消费");
    const located = markers().find((item) => item.title.includes("编辑后的测试机"));
    const rect = located.getBoundingClientRect(),
      canvas = document.querySelector(".forest-map__canvas").getBoundingClientRect();
    check(
      Math.abs(rect.left + rect.width / 2 - canvas.left - canvas.width / 2) < 3,
      "经度定位不在地图中心"
    );
    check(
      Math.abs(rect.top + rect.height / 2 - canvas.top - canvas.height / 2) < 3,
      "纬度定位不在地图中心"
    );
    check(uavPane().style.opacity === "0.4", "重建丢失 UAV 透明度");
    await button("绘制点");
    located.click();
    await nextTick();
    check(mapState().count === 1, `Marker 抢占绘制交互，结果数量 ${mapState().count}`);
    check(!document.querySelector(".leaflet-popup"), "绘制模式中残留 Popup");
    const businessCount = document.querySelectorAll(".ff-business-symbol").length;
    await button("清除临时绘制");
    check(
      markers().length === 9 &&
        document.querySelectorAll(".ff-business-symbol").length === businessCount,
      "Drawing 清除误删业务层"
    );
    passed.push("列表定位、地图重建、Marker 绘制透传及图层隔离");

    await router.push("/uav/list");
    await nextTick();
    await waitFor(() => row("编辑后的测试机"));
    await button("删除", row("编辑后的测试机"));
    await waitFor(
      () =>
        document.querySelector(".uav-delete-dialog") &&
        visible(document.querySelector(".uav-delete-dialog"))
    );
    check(store.list.length === 9, "未确认即删除");
    await button("取消", document.querySelector(".uav-delete-dialog"));
    check(store.list.length === 9, "取消删除仍修改数据");
    await button("删除", row("编辑后的测试机"));
    await waitFor(
      () =>
        document.querySelector(".uav-delete-dialog") &&
        visible(document.querySelector(".uav-delete-dialog"))
    );
    await button("确认删除", document.querySelector(".uav-delete-dialog"));
    await waitFor(() => rows().length === 8);
    check(store.selectedId === null, "删除未清除选中");
    await router.push("/dashboard");
    await waitFor(() => mapState()?.ready && markers().length === 8);
    check(!markers().some((item) => item.title.includes("编辑后的测试机")), "删除后 Marker 残留");
    check(
      document.querySelectorAll(".ff-business-symbol").length === 2 &&
        document.querySelectorAll(".ff-fire-symbol").length === 10 &&
        document.querySelector(".leaflet-ff-business-HighRiskLayer-pane path"),
      "CRUD 破坏其他业务层"
    );
    passed.push("删除二次确认、取消、列表和 Marker 同步移除");
    markers()[0].click();
    await nextTick();
    const liveId = store.selectedId;
    check(liveId && document.querySelector(".leaflet-popup"), "未打开待删除 Marker 的 Popup");
    store.remove(liveId);
    await nextTick();
    check(
      markers().length === 7 && !document.querySelector(".leaflet-popup"),
      "活动地图删除残留 Marker/Popup"
    );
    store.reset();
    await nextTick();
    check(markers().length === 8 && !store.selectedId, "会话重置未恢复地图");
    await router.push("/uav/list");
    await nextTick();
    await waitFor(() => rows().length === 8);
    await button("删除", rows()[0]);
    step = "等待跨页删除确认框打开";
    await waitFor(
      () =>
        document.querySelector(".uav-delete-dialog") &&
        visible(document.querySelector(".uav-delete-dialog"))
    );
    await router.push("/dashboard");
    await waitFor(() => mapState()?.ready);
    check(store.list.length === 8, "切页误执行删除");
    await router.push("/uav/list");
    await nextTick();
    step = "等待返回列表后确认框关闭";
    await waitFor(() => !document.querySelector(".uav-delete-dialog"));
    await button("新增无人机");
    step = "等待会话重置后表单关闭";
    store.reset();
    await nextTick();
    await waitFor(() => ![...document.querySelectorAll(".el-dialog")].some(visible));
    check(store.list.length === 8, "会话切换残留修改");
    passed.push("活动地图删除 Popup、取消跨页确认与会话重置");
    return { passed };
  } catch (error) {
    const page = document.querySelector(".uav-page")?.__vueParentComponent.setupState;
    return {
      passed,
      error: `${step}：${error.message}; 状态 ${JSON.stringify({ formOpen: page?.formOpen, deleting: page?.deleting, dialogs: [...document.querySelectorAll(".el-dialog")].map((item) => ({ title: item.querySelector(".el-dialog__title")?.textContent, visible: visible(item), style: item.parentElement.style.cssText })) })}`,
      buttons: [...document.querySelectorAll(".uav-page button")].map((item) => ({
        text: item.textContent,
        disabled: item.disabled,
        visible: visible(item),
      })),
    };
  }
}
