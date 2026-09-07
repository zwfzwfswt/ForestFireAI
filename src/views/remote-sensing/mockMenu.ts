import type { RouteItem } from "../../api/system/menu/types";
export function withRemoteSensingMockMenu(routes: RouteItem[]): RouteItem[] {
  const names = [
    "RemoteSensingMockRoot",
    "RemoteSensingData",
    "RemoteSensingProducts",
    "SatelliteHotspots",
    "FireRiskZones",
  ];
  const conflicts = (items: RouteItem[]): boolean =>
    items.some(
      (item) =>
        item.path === "/remote-sensing" ||
        item.path?.startsWith("/remote-sensing/") ||
        names.includes(item.name ?? "") ||
        conflicts(item.children ?? [])
    );
  if (conflicts(routes)) return routes;
  return [
    ...routes,
    {
      path: "/remote-sensing",
      component: "Layout",
      name: names[0],
      redirect: "/remote-sensing/data",
      meta: { title: "遥感监测", icon: "el-icon-Picture" },
      children: [
        {
          path: "data",
          name: names[1],
          component: "remote-sensing/data/index",
          meta: { title: "遥感数据", keepAlive: true },
          children: [],
        },
        {
          path: "products",
          name: names[2],
          component: "remote-sensing/products/index",
          meta: { title: "遥感产品", keepAlive: true },
          children: [],
        },
        {
          path: "hotspots",
          name: names[3],
          component: "remote-sensing/hotspots/index",
          meta: { title: "卫星火点", keepAlive: true },
          children: [],
        },
        {
          path: "fire-risk",
          name: names[4],
          component: "remote-sensing/fire-risk/index",
          meta: { title: "火险分区", keepAlive: true },
          children: [],
        },
      ],
    },
  ];
}
