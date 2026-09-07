import type { RouteItem } from "../../api/system/menu/types";
// 与现有已登录 Mock UAV 菜单共用动态路由机制；不写入远程菜单或权限。
export function withFireMockMenu(routes: RouteItem[]): RouteItem[] {
  const conflicts = (items: RouteItem[]): boolean =>
    items.some(
      (item) =>
        item.path === "/fire" ||
        item.path?.startsWith("/fire/") ||
        ["FireMockRoot", "FireEvents"].includes(item.name ?? "") ||
        conflicts(item.children ?? [])
    );
  if (conflicts(routes)) return routes;
  return [
    ...routes,
    {
      path: "/fire",
      component: "Layout",
      name: "FireMockRoot",
      redirect: "/fire/events",
      meta: { title: "火情管理", icon: "el-icon-Warning" },
      children: [
        {
          path: "events",
          name: "FireEvents",
          component: "fire/index",
          meta: { title: "火情事件", icon: "el-icon-Warning", keepAlive: true },
          children: [],
        },
      ],
    },
  ];
}
