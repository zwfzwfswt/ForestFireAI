import type { RouteItem } from "../../api/system/menu/types";

// 本地 Mock 菜单与上游菜单共用 transformRoutes；不修改远程菜单或权限数据。
// 当前仅向已登录用户提供前端样例编辑，无真实资产写入权限。
export function withUavMockMenu(routes: RouteItem[]): RouteItem[] {
  const conflicts = (items: RouteItem[]): boolean =>
    items.some(
      (item) =>
        item.path === "/uav" ||
        item.path?.startsWith("/uav/") ||
        item.name === "UavAssets" ||
        item.name === "UavMockRoot" ||
        conflicts(item.children ?? [])
    );
  if (conflicts(routes)) return routes;
  return [
    ...routes,
    {
      path: "/uav",
      component: "Layout",
      name: "UavMockRoot",
      redirect: "/uav/list",
      meta: { title: "无人机管理", icon: "el-icon-Position" },
      children: [
        {
          path: "list",
          name: "UavAssets",
          component: "uav/index",
          meta: { title: "无人机管理", icon: "el-icon-Position", keepAlive: true },
          children: [],
        },
      ],
    },
  ];
}
