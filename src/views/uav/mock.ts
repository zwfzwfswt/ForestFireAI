import type { Uav, UavStatus } from "./types";

// 纯前端虚构资产快照，未来替换数据适配层；不代表真实设备或遥测。
export function createMockUavs(): Uav[] {
  const statuses: UavStatus[] = [
    "online",
    "offline",
    "mission",
    "charging",
    "maintenance",
    "warning",
    "online",
    "mission",
  ];
  return statuses.map((status, index) => ({
    id: `mock-uav-${index + 1}`,
    name: `林区巡护机 ${String(index + 1).padStart(2, "0")}`,
    serialNumber: `MOCK-FF-${String(index + 1).padStart(4, "0")}`,
    model: ["巡护四旋翼 A", "热成像四旋翼 B", "测绘多旋翼 C"][index % 3],
    status,
    position: {
      longitude: 119.52 + (index % 4) * 0.1,
      latitude: 30.13 + Math.floor(index / 4) * 0.19,
      altitude: [80, 0, 120, 0, 0, 60, 90, 110][index],
    },
    telemetry: {
      speed: [4, 0, 8, 0, 0, 3, 5, 7][index],
      heading: index * 40,
      battery: [92, 40, 76, 35, 60, 18, 88, 67][index],
      signal: [96, 0, 89, 95, 0, 28, 92, 86][index],
    },
    payload: {
      camera: true,
      thermalCamera: index % 3 === 1,
      rtk: index % 3 === 2,
      speaker: index % 2 === 0,
      aiBox: index === 5,
    },
    organization: index < 4 ? "示范林区北部管护站" : "示范林区南部管护站",
    lastOnlineAt: status === "offline" ? "2026-09-05T08:00:00Z" : "2026-09-06T06:32:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-06T06:32:00Z",
  }));
}
