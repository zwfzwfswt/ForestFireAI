import type { RouteItem } from "../../api/system/menu/types";
export function withEnvironmentMockMenu(routes: RouteItem[]): RouteItem[] {
  const names = [
    "EnvironmentMockRoot",
    "EnvironmentWeather",
    "EnvironmentForecast",
    "EnvironmentFireRiskFactors",
  ];
  const conflicts = (items: RouteItem[]): boolean =>
    items.some(
      (item) =>
        item.path === "/environment" ||
        item.path?.startsWith("/environment/") ||
        names.includes(item.name ?? "") ||
        conflicts(item.children ?? [])
    );
  if (conflicts(routes)) return routes;
  return [
    ...routes,
    {
      path: "/environment",
      component: "Layout",
      name: names[0],
      redirect: "/environment/weather",
      meta: { title: "环境监测", icon: "el-icon-Sunny" },
      children: [
        {
          path: "weather",
          component: "environment/weather/index",
          name: names[1],
          meta: { title: "实时气象", keepAlive: true },
          children: [],
        },
        {
          path: "forecast",
          component: "environment/forecast/index",
          name: names[2],
          meta: { title: "气象预报", keepAlive: true },
          children: [],
        },
        {
          path: "fire-risk-factors",
          component: "environment/fire-risk-factors/index",
          name: names[3],
          meta: { title: "火险因子", keepAlive: true },
          children: [],
        },
      ],
    },
  ];
}
